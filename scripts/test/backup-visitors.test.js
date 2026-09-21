// Checks of scripts/backup-visitors.sh against a local bare repository standing in for
// mxrjup/mxrjup-visitors, with the real server writing the visitor data.
// Run with: node --test scripts/test/*.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;

const CODE_ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(CODE_ROOT, 'scripts', 'backup-visitors.sh');
const SERVER = path.join(CODE_ROOT, 'server', 'server.js');

// Keep the user's git configuration (signing, hooks, default branch) out of the test.
const GIT_ENV = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid'
};

const git = (cwd, ...args) =>
    execFileSync('git', args, {
        cwd,
        env: { ...process.env, ...GIT_ENV },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

function run(command, args, env) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            env: { ...process.env, ...GIT_ENV, ...env },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('exit', (code) => resolve({ code, output }));
    });
}

const backup = (env = {}, script = SCRIPT) =>
    run('bash', [script], { VISITORS_DIR: visitors, BACKUP_RETRY_DELAY: '0', ...env });

function startServer(visitorsDir) {
    const child = spawn(process.execPath, [SERVER], {
        env: { ...process.env, PORT: '0', CONTENT_DIR: content, VISITORS_DIR: visitorsDir },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const port = new Promise((resolve, reject) => {
        const onData = (chunk) => {
            output += chunk;
            const match = output.match(/Server running on port (\d+)/);
            if (match) resolve(Number(match[1]));
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', () => reject(new Error(output)));
    });
    return { child, base: port.then((p) => `http://localhost:${p}`) };
}

let tmp;
let remote;
let content;
let visitors;
let server;
let base;

const remoteCommits = () => Number(git(remote, 'rev-list', '--count', 'main'));
const lastCommitFiles = () =>
    git(remote, 'show', '--name-only', '--format=', 'main').split('\n').filter(Boolean).sort();
const dataFile = (name) => path.join(visitors, 'data', name);

before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-backup-'));
    remote = path.join(tmp, 'visitors.git');
    content = path.join(tmp, 'content');
    visitors = path.join(tmp, 'visitors');

    await fs.mkdir(path.join(content, 'data'), { recursive: true });
    git(tmp, 'init', '-q', '--bare', '-b', 'main', remote);
    git(tmp, 'clone', '-q', remote, visitors);
    git(visitors, 'symbolic-ref', 'HEAD', 'refs/heads/main');

    // The server fills the empty clone with its two data files.
    server = startServer(visitors);
    base = await server.base;
});

after(async () => {
    if (server) server.child.kill();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

test('the first run commits the initial state and pushes it', async () => {
    const { code, output } = await backup();
    assert.equal(code, 0, output);
    assert.equal(remoteCommits(), 1);
    assert.deepEqual(lastCommitFiles(), [
        '.gitignore', 'data/chat_data.json', 'data/computer_files.json'
    ]);
    assert.match(git(remote, 'log', '-1', '--format=%an <%ae> %s', 'main'),
        /^mxrjup backup <backup@mxrjup\.invalid> Backup \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
});

test('a run with nothing new creates no commit', async () => {
    const { code, output } = await backup();
    assert.equal(code, 0, output);
    assert.match(output, /no changes since the last backup/);
    assert.equal(remoteCommits(), 1);
});

test('an upload is committed with the file and the index', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello visitor']), 'hello.txt');
    form.append('folder', 'My Documents');
    const res = await fetch(`${base}/api/computer/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    const { file } = await res.json();

    const { code, output } = await backup();
    assert.equal(code, 0, output);
    assert.equal(remoteCommits(), 2);
    assert.deepEqual(lastCommitFiles(), ['data/computer_files.json', `uploads/${file.id}`]);
    assert.equal(git(remote, 'show', `main:uploads/${file.id}`), 'hello visitor');
});

test('temporary files of the atomic writes are never committed', async () => {
    await fs.writeFile(dataFile('.chat_data.json.123.abcdef.tmp'), '{"half');
    await fetch(`${base}/api/chat/general/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'ann', text: 'hi' })
    });

    const { code, output } = await backup();
    assert.equal(code, 0, output);
    assert.deepEqual(lastCommitFiles(), ['data/chat_data.json']);
    await fs.unlink(dataFile('.chat_data.json.123.abcdef.tmp'));
});

test('invalid JSON fails without committing anything', async () => {
    const good = await fs.readFile(dataFile('chat_data.json'), 'utf8');
    await fs.writeFile(dataFile('chat_data.json'), good.slice(0, 20));
    await fs.writeFile(path.join(visitors, 'uploads', 'new.txt'), 'new');
    const before = remoteCommits();

    const { code, output } = await backup({ BACKUP_ATTEMPTS: '2' });
    assert.notEqual(code, 0);
    assert.match(output, /BACKUP FAILED: invalid JSON after 2 attempts, nothing committed: data\/chat_data\.json/);
    assert.equal(remoteCommits(), before);
    assert.equal(git(visitors, 'rev-list', '--count', 'HEAD'), String(before));
    // Nothing is left staged for whoever looks at the clone next.
    assert.equal(git(visitors, 'diff', '--cached', '--name-only'), '');

    await fs.writeFile(dataFile('chat_data.json'), good);
    await fs.unlink(path.join(visitors, 'uploads', 'new.txt'));
});

test('a file that becomes valid during the retries is backed up', async () => {
    const good = await fs.readFile(dataFile('chat_data.json'), 'utf8');
    const changed = good.replace('"hi"', '"hi again"');
    await fs.writeFile(dataFile('chat_data.json'), '{');
    setTimeout(() => fs.writeFile(dataFile('chat_data.json'), changed), 500);

    const { code, output } = await backup({ BACKUP_ATTEMPTS: '5', BACKUP_RETRY_DELAY: '1' });
    assert.equal(code, 0, output);
    assert.match(output, /invalid JSON \(attempt 1\/5\)/);
    assert.equal(git(remote, 'show', 'main:data/chat_data.json'), changed.trim());
});

test('a clone missing the data files is refused rather than committed as a wipe', async () => {
    const empty = path.join(tmp, 'empty-clone');
    git(tmp, 'clone', '-q', remote, empty);
    await fs.unlink(path.join(empty, 'data', 'chat_data.json'));
    const before = remoteCommits();

    const { code, output } = await backup({ VISITORS_DIR: empty });
    assert.notEqual(code, 0);
    assert.match(output, /data\/chat_data\.json is missing/);
    assert.equal(remoteCommits(), before);
});

test('a directory that is not its own clone is refused', async () => {
    const plain = path.join(tmp, 'visitors', 'uploads');
    let result = await backup({ VISITORS_DIR: plain });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /is not the root of its own clone/);

    const nowhere = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-not-a-clone-'));
    result = await backup({ VISITORS_DIR: nowhere });
    await fs.rm(nowhere, { recursive: true });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /is not a git clone/);
});

test('VISITORS_DIR is read from server/.env, relative to the code root', async () => {
    // A copy of the script in a fake code checkout, whose .env points at the clone.
    const code = path.join(tmp, 'code');
    await fs.mkdir(path.join(code, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(code, 'server'));
    await fs.copyFile(SCRIPT, path.join(code, 'scripts', 'backup-visitors.sh'));
    await fs.writeFile(path.join(code, 'server', '.env'),
        'PORT=3000\nVISITORS_DIR="../visitors"\nOTHER=has spaces\n');
    await fs.writeFile(path.join(visitors, 'uploads', 'via-env.txt'), 'env');

    const { code: status, output } = await backup(
        { VISITORS_DIR: '' }, path.join(code, 'scripts', 'backup-visitors.sh'));
    assert.equal(status, 0, output);
    assert.deepEqual(lastCommitFiles(), ['uploads/via-env.txt']);
});

test('a fresh clone of the backup restores the same computer', async () => {
    const snapshot = async (url) => {
        const files = await (await fetch(`${url}/api/computer/files`)).json();
        const downloads = {};
        for (const file of files.files) {
            downloads[file.id] = await (await fetch(url + file.path)).text();
        }
        return {
            files,
            downloads,
            quota: await (await fetch(`${url}/api/computer/quota`)).json(),
            rooms: await (await fetch(`${url}/api/chat/rooms`)).json(),
            general: await (await fetch(`${url}/api/chat/general/messages`)).json()
        };
    };

    const { code, output } = await backup();
    assert.equal(code, 0, output);
    const original = await snapshot(base);
    assert.equal(original.files.files.length, 1);

    const restored = path.join(tmp, 'restored');
    git(tmp, 'clone', '-q', remote, restored);
    const other = startServer(restored);
    try {
        assert.deepEqual(await snapshot(await other.base), original);
    } finally {
        other.child.kill();
    }
});

test('a second backup running at the same time is refused', async () => {
    const lock = path.join(visitors, '.git', 'backup-visitors.lock');
    await fs.mkdir(lock);
    try {
        const { code, output } = await backup();
        assert.notEqual(code, 0);
        assert.match(output, /another backup holds/);
    } finally {
        await fs.rmdir(lock);
    }
});

// Last: it leaves the clone diverged from the remote.
test('a rejected push fails loudly and is never forced', async () => {
    const elsewhere = path.join(tmp, 'elsewhere');
    git(tmp, 'clone', '-q', remote, elsewhere);
    await fs.writeFile(path.join(elsewhere, 'README'), 'pushed by hand');
    git(elsewhere, 'add', 'README');
    git(elsewhere, 'commit', '-q', '-m', 'By hand');
    git(elsewhere, 'push', '-q', 'origin', 'main');
    const remoteHead = git(remote, 'rev-parse', 'main');

    await fs.writeFile(path.join(visitors, 'uploads', 'late.txt'), 'late');
    const { code, output } = await backup();
    assert.notEqual(code, 0);
    assert.match(output, /BACKUP FAILED: git push to origin\/main failed/);
    assert.equal(git(remote, 'rev-parse', 'main'), remoteHead);
});
