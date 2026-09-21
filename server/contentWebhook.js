const crypto = require('crypto');
const { execFile } = require('child_process');

/**
 * Publishing content without SSH. Infomaniak's Node.js sites cannot be driven from
 * GitHub Actions, so GitHub calls the site instead: a webhook of mxrjup-content, sent
 * on every push (CMS saves and the Spotify sync included - webhooks, unlike workflows,
 * fire for pushes made with GITHUB_TOKEN), makes the server fast-forward its own
 * checkout of the content, CONTENT_DIR. The server rereads the JSON on every request
 * and serves the media from disk, so the change is live as soon as the pull ends.
 *
 * The request carries nothing the server acts on beyond "main moved": what is pulled
 * comes from the repository itself, never from the payload. Only a correct HMAC
 * signature, made with the secret shared with GitHub, gets that far.
 */

const MAIN_REF = 'refs/heads/main';
// A git command that hangs (network, lock) must not block every later publish.
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Check GitHub's X-Hub-Signature-256 header ("sha256=<hex>") against the raw body.
 * The comparison runs in constant time so the signature cannot be guessed byte by byte.
 */
function verifySignature(secret, rawBody, header) {
    if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
    const expected = Buffer.from(
        'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    );
    const received = Buffer.from(header);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function runGit(dir, args, git) {
    return new Promise((resolve, reject) => {
        execFile(git, ['-C', dir, ...args], { timeout: GIT_TIMEOUT_MS }, (err, stdout, stderr) => {
            if (err) {
                err.message = `git ${args.join(' ')} failed: ${(stderr || err.message).trim()}`;
                return reject(err);
            }
            resolve(stdout.trim());
        });
    });
}

/**
 * Bring the content checkout up to origin/main, fast-forward only. Refuses, changing
 * nothing, when the checkout was edited on the host, is not on main, or has commits
 * main does not: that is for a person to sort out, and the site keeps serving what it
 * has meanwhile. Resolves to a one-line summary, rejects with the reason.
 */
async function pullContent(dir, git = 'git') {
    const changes = await runGit(dir, ['status', '--porcelain'], git);
    if (changes) throw new Error(`the content checkout has local changes:\n${changes}`);

    const branch = await runGit(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], git)
        .catch(() => 'a detached HEAD');
    if (branch !== 'main') throw new Error(`the content checkout is on ${branch}, not main`);

    const before = await runGit(dir, ['rev-parse', '--short', 'HEAD'], git);
    await runGit(dir, ['fetch', '--quiet', 'origin', 'main'], git);
    try {
        await runGit(dir, ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD'], git);
    } catch {
        throw new Error('the content checkout has diverged from origin/main; ' +
            'compare with: git log --oneline --graph HEAD FETCH_HEAD');
    }
    await runGit(dir, ['merge', '--quiet', '--ff-only', 'FETCH_HEAD'], git);
    const after = await runGit(dir, ['rev-parse', '--short', 'HEAD'], git);
    return before === after ? `already at ${after}` : `${before} -> ${after}`;
}

/**
 * One pull at a time. A push arriving while a pull runs is not lost: one more pull
 * follows, and it takes everything pushed meanwhile, so any number of pushes during a
 * pull cost a single extra one.
 */
function createContentUpdater({ dir, git = 'git', log = console }) {
    let running = null;
    let again = false;

    async function loop() {
        do {
            again = false;
            try {
                log.log(`Content update: ${await pullContent(dir, git)}`);
            } catch (err) {
                log.error(`Content update refused: ${err.message}`);
            }
        } while (again);
        running = null;
    }

    return {
        /** Ask for an update; resolves once the content is at least as new as now. */
        request() {
            if (running) {
                again = true;
                return running;
            }
            running = loop();
            return running;
        }
    };
}

/**
 * The route handler. It must be mounted with a raw body parser (the signature covers
 * the exact bytes GitHub sent), and it answers GitHub at once: the pull runs after the
 * response, and its outcome goes to the server log.
 */
function createContentHook({ secret, updater }) {
    return (req, res) => {
        // No secret configured means publishing by webhook is off; say so rather than
        // accept unsigned requests.
        if (!secret) return res.status(503).json({ error: 'Content webhook is not configured' });

        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!verifySignature(secret, body, req.get('X-Hub-Signature-256'))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = req.get('X-GitHub-Event');
        if (event === 'ping') return res.json({ ok: true });
        if (event !== 'push') return res.status(202).json({ ignored: `event ${event}` });

        let ref;
        try {
            ref = JSON.parse(body.toString('utf8')).ref;
        } catch {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        if (ref !== MAIN_REF) return res.status(202).json({ ignored: `ref ${ref}` });

        updater.request();
        res.status(202).json({ updating: true });
    };
}

module.exports = { verifySignature, pullContent, createContentUpdater, createContentHook };
