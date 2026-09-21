// scripts/host-build.sh against throwaway repositories: a bare "GitHub" with tags, and
// a clone standing for the site's code checkout. npm is a stub that records its calls.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SCRIPT = path.join(__dirname, '..', 'host-build.sh');

const GIT_ENV = {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t'
};
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', env: { ...process.env, ...GIT_ENV }
}).trim();

let tmp;
let bin;
before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mxrjup-host-build-'));
    // The stub npm logs "npm <args>" to $NPM_LOG; with STUB_LEAVE_FILE set, the build
    // leaves a file git sees behind.
    bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'npm'), [
        '#!/bin/sh',
        'echo "npm $*" >> "$NPM_LOG"',
        'if [ "$1 $2" = "run build" ]; then',
        '  mkdir -p dist && echo built > dist/index.html',
        '  if [ -n "$STUB_LEAVE_FILE" ]; then echo x > stray.txt; fi',
        'fi'
    ].join('\n'), { mode: 0o755 });
});
after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * An origin with one commit per tag given, each carrying the real host-build.sh (each
 * with more lines at the top, so a checkout rewrites the running script under bash), and
 * a host clone of it still on main's first commit.
 */
function repos(name, tags) {
    const root = path.join(tmp, name);
    const origin = path.join(root, 'origin.git');
    const dev = path.join(root, 'dev');
    const host = path.join(root, 'host');
    fs.mkdirSync(root);
    execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '--quiet', origin, dev], { stdio: 'ignore' });
    fs.mkdirSync(path.join(dev, 'scripts'));
    fs.writeFileSync(path.join(dev, '.gitignore'), '/dist\nnode_modules/\n');
    const scriptCopy = path.join(dev, 'scripts', 'host-build.sh');
    fs.copyFileSync(SCRIPT, scriptCopy);
    fs.writeFileSync(path.join(dev, 'version.txt'), 'untagged');
    git(dev, 'add', '-A');
    git(dev, 'commit', '--quiet', '-m', 'start');
    git(dev, 'push', '--quiet', 'origin', 'main');
    execFileSync('git', ['clone', '--quiet', origin, host], { stdio: 'ignore' });

    const commits = {};
    tags.forEach((tag, i) => {
        fs.writeFileSync(path.join(dev, 'version.txt'), tag);
        // Lines added near the top shift everything bash has not read yet.
        const [shebang, ...rest] = fs.readFileSync(scriptCopy, 'utf8').split('\n');
        const padding = `${'#'.repeat(i + 1)} padding for ${tag}`;
        fs.writeFileSync(scriptCopy, [shebang, ...Array(40).fill(padding), ...rest].join('\n'));
        git(dev, 'commit', '--quiet', '-am', tag);
        git(dev, 'tag', tag);
        commits[tag] = git(dev, 'rev-parse', 'HEAD');
    });
    git(dev, 'push', '--quiet', 'origin', 'main', '--tags');
    return { origin, dev, host, commits };
}

function build(host, env = {}) {
    const npmLog = path.join(host, '..', `npm-${Date.now()}-${Math.random()}.log`);
    const result = spawnSync('bash', [path.join(host, 'scripts', 'host-build.sh')], {
        encoding: 'utf8',
        env: { ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`,
            NPM_LOG: npmLog, ...env }
    });
    const npm = fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf8').trim().split('\n') : [];
    return { ...result, npm, output: result.stdout + result.stderr };
}

test('checks out the newest v* tag in version order, then installs and builds', () => {
    const r = repos('newest', ['v1.2.0', 'v1.10.0', 'v1.9.0']);
    const result = build(r.host);
    assert.equal(result.status, 0, result.output);
    assert.equal(git(r.host, 'rev-parse', 'HEAD'), r.commits['v1.10.0']);
    assert.equal(fs.readFileSync(path.join(r.host, 'version.txt'), 'utf8'), 'v1.10.0');
    assert.deepEqual(result.npm, ['npm ci --no-audit --no-fund', 'npm run build']);
    assert.match(result.output, /ready: v1\.10\.0/);
    assert.equal(git(r.host, 'status', '--porcelain'), '');
});

test('refuses to touch a checkout with local changes', () => {
    const r = repos('dirty', ['v1.0.0']);
    fs.writeFileSync(path.join(r.host, 'version.txt'), 'hot-fix');
    const before = git(r.host, 'rev-parse', 'HEAD');
    const result = build(r.host);
    assert.equal(result.status, 1);
    assert.match(result.output, /BUILD FAILED: .*local changes/);
    assert.equal(git(r.host, 'rev-parse', 'HEAD'), before);
    assert.equal(fs.readFileSync(path.join(r.host, 'version.txt'), 'utf8'), 'hot-fix');
    assert.deepEqual(result.npm, []);
});

test('fails without any v* tag', () => {
    const r = repos('untagged', []);
    const result = build(r.host);
    assert.equal(result.status, 1);
    assert.match(result.output, /no v\* tag/);
    assert.deepEqual(result.npm, []);
});

test('a tag deleted on GitHub is not deployed', () => {
    const r = repos('withdrawn', ['v1.0.0', 'v1.1.0']);
    assert.equal(build(r.host).status, 0);
    assert.equal(git(r.host, 'rev-parse', 'HEAD'), r.commits['v1.1.0']);
    git(r.dev, 'push', '--quiet', 'origin', ':refs/tags/v1.1.0');
    const result = build(r.host);
    assert.equal(result.status, 0, result.output);
    assert.equal(git(r.host, 'rev-parse', 'HEAD'), r.commits['v1.0.0']);
});

test('a build that leaves a file git sees fails, so the cause shows now', () => {
    const r = repos('stray', ['v1.0.0']);
    const result = build(r.host, { STUB_LEAVE_FILE: '1' });
    assert.equal(result.status, 1);
    assert.match(result.output, /stray\.txt/);
    assert.match(result.output, /BUILD FAILED: the install or build left files/);
});
