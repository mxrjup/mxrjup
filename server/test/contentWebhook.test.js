// The content webhook: signature checks, the fast-forward-only pull against real git
// repositories, and the route end to end in a real server process.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const {
    verifySignature, pullContent, createContentUpdater
} = require('../contentWebhook');

const SERVER = path.join(__dirname, '..', 'server.js');
const SECRET = 'test-secret';

const sign = (body, secret = SECRET) =>
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t'
    }
}).trim();

let tmp;
before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-hook-'));
});
after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

/**
 * A bare "GitHub" repository with one commit on main, a clone standing for the host's
 * CONTENT_DIR, and a second clone standing for the CMS that pushes new content.
 */
async function contentRepos(name) {
    const root = path.join(tmp, name);
    const origin = path.join(root, 'origin.git');
    const host = path.join(root, 'host');
    const cms = path.join(root, 'cms');
    await fs.mkdir(root);
    execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '--quiet', origin, cms], { stdio: 'ignore' });
    await fs.mkdir(path.join(cms, 'data'));
    await fs.writeFile(path.join(cms, 'data', 'reviews.json'), '{"items":[]}');
    git(cms, 'add', '-A');
    git(cms, 'commit', '--quiet', '-m', 'first');
    git(cms, 'push', '--quiet', 'origin', 'main');
    execFileSync('git', ['clone', '--quiet', origin, host], { stdio: 'ignore' });

    const publish = async (items) => {
        await fs.writeFile(path.join(cms, 'data', 'reviews.json'), JSON.stringify({ items }));
        git(cms, 'commit', '--quiet', '-am', 'publish');
        git(cms, 'push', '--quiet', 'origin', 'main');
        return git(cms, 'rev-parse', 'HEAD');
    };
    return { origin, host, cms, publish };
}

test('verifySignature accepts GitHub\'s signature and nothing else', () => {
    const body = Buffer.from('{"ref":"refs/heads/main"}');
    assert.equal(verifySignature(SECRET, body, sign(body)), true);
    assert.equal(verifySignature(SECRET, body, sign(body, 'other')), false);
    assert.equal(verifySignature(SECRET, Buffer.from('{}'), sign(body)), false);
    assert.equal(verifySignature(SECRET, body, sign(body).replace('sha256=', 'sha1=')), false);
    assert.equal(verifySignature(SECRET, body, 'sha256=00'), false);
    assert.equal(verifySignature(SECRET, body, undefined), false);
    // No secret configured: nothing verifies, not even a signature made with ''.
    assert.equal(verifySignature('', body, sign(body, '')), false);
});

test('pullContent fast-forwards the host checkout to origin/main', async () => {
    const repos = await contentRepos('ff');
    assert.match(await pullContent(repos.host), /^already at /);
    const head = await repos.publish([{ id: 'r1' }]);
    assert.match(await pullContent(repos.host), / -> /);
    assert.equal(git(repos.host, 'rev-parse', 'HEAD'), head);
    const saved = await fs.readFile(path.join(repos.host, 'data', 'reviews.json'), 'utf8');
    assert.deepEqual(JSON.parse(saved), { items: [{ id: 'r1' }] });
});

test('pullContent refuses a checkout edited on the host, and changes nothing', async () => {
    const repos = await contentRepos('dirty');
    await repos.publish([{ id: 'new' }]);
    const before = git(repos.host, 'rev-parse', 'HEAD');
    await fs.writeFile(path.join(repos.host, 'data', 'reviews.json'), '{"items":["edited"]}');
    await assert.rejects(pullContent(repos.host), /local changes/);
    assert.equal(git(repos.host, 'rev-parse', 'HEAD'), before);
    const kept = await fs.readFile(path.join(repos.host, 'data', 'reviews.json'), 'utf8');
    assert.equal(kept, '{"items":["edited"]}');
});

test('pullContent refuses a diverged history instead of merging', async () => {
    const repos = await contentRepos('diverged');
    git(repos.host, 'commit', '--quiet', '--allow-empty', '-m', 'made on the host');
    const local = git(repos.host, 'rev-parse', 'HEAD');
    await repos.publish([{ id: 'r2' }]);
    await assert.rejects(pullContent(repos.host), /diverged/);
    assert.equal(git(repos.host, 'rev-parse', 'HEAD'), local);
});

test('pullContent refuses a checkout that is not on main', async () => {
    const repos = await contentRepos('branch');
    git(repos.host, 'checkout', '--quiet', '--detach');
    await assert.rejects(pullContent(repos.host), /not main/);
});

test('pushes arriving during a pull cost one more pull, not one each', async () => {
    const repos = await contentRepos('coalesce');
    const lines = [];
    const updater = createContentUpdater({
        dir: repos.host,
        log: { log: (l) => lines.push(l), error: (l) => lines.push(l) }
    });
    const head = await repos.publish([{ id: 'a' }]);
    const first = updater.request();
    const second = updater.request();
    const third = updater.request();
    await Promise.all([first, second, third]);
    assert.equal(lines.length, 2, lines.join('\n'));
    assert.equal(git(repos.host, 'rev-parse', 'HEAD'), head);
});

function startServer(env) {
    const child = spawn(process.execPath, [SERVER], {
        env: { ...process.env, PORT: '0', ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const ready = new Promise((resolve, reject) => {
        const onData = (chunk) => {
            output += chunk;
            const match = output.match(/Server running on port (\d+)/);
            if (match) resolve(Number(match[1]));
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => reject(Object.assign(new Error(output), { code })));
    });
    return { child, ready, output: () => output };
}

const hook = (base, event, payload, signature) => {
    const body = JSON.stringify(payload);
    return fetch(`${base}/api/hooks/content`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-GitHub-Event': event,
            'X-Hub-Signature-256': signature === undefined ? sign(body) : signature
        },
        body
    });
};

async function until(check, what) {
    for (let i = 0; i < 100; i++) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${what}`);
}

test('a signed push to main is live on the next request, without a restart', async () => {
    const repos = await contentRepos('e2e');
    const server = startServer({
        CONTENT_DIR: repos.host,
        VISITORS_DIR: path.join(tmp, 'e2e-visitors'),
        CONTENT_WEBHOOK_SECRET: SECRET
    });
    try {
        const base = `http://localhost:${await server.ready}`;
        const reviews = async () => (await fetch(`${base}/api/data/reviews`)).json();
        assert.deepEqual(await reviews(), []);

        assert.equal((await hook(base, 'ping', { zen: 'hi' })).status, 200);

        await repos.publish([{ id: 'live' }]);
        // Refused before anything runs: bad signature, other branch, other event.
        const main = { ref: 'refs/heads/main' };
        assert.equal((await hook(base, 'push', main, sign('{}'))).status, 401);
        assert.equal((await hook(base, 'push', main, '')).status, 401);
        assert.equal((await hook(base, 'push', { ref: 'refs/heads/draft' })).status, 202);
        assert.equal((await hook(base, 'issues', main)).status, 202);
        assert.deepEqual(await reviews(), []);

        const accepted = await hook(base, 'push', main);
        assert.equal(accepted.status, 202);
        assert.deepEqual(await accepted.json(), { updating: true });
        await until(async () => (await reviews()).length === 1, 'the pulled content');
        assert.deepEqual(await reviews(), [{ id: 'live' }]);
        assert.match(server.output(), /Content update: \w+ -> \w+/);
    } finally {
        server.child.kill();
    }
});

test('without CONTENT_WEBHOOK_SECRET the route is off', async () => {
    const repos = await contentRepos('off');
    // Set but empty, so a CONTENT_WEBHOOK_SECRET in a local server/.env cannot fill it.
    const server = startServer({
        CONTENT_DIR: repos.host,
        VISITORS_DIR: path.join(tmp, 'off-visitors'),
        CONTENT_WEBHOOK_SECRET: ''
    });
    try {
        const base = `http://localhost:${await server.ready}`;
        const res = await hook(base, 'push', { ref: 'refs/heads/main' }, sign('x', ''));
        assert.equal(res.status, 503);
    } finally {
        server.child.kill();
    }
});
