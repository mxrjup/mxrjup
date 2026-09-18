/**
 * Git-backed storage for admin content.
 *
 * The host's disk is a cache, not the source of truth: uploads are written
 * locally so they can be served immediately, and committed to GitHub so they
 * survive a redeploy (or a move to another host). Every deploy resets the
 * working tree to the remote, which brings the content back.
 *
 * Only admin content goes through here - the media files under server/uploads/
 * and the JSON content files under server/data/. Guest uploads from the
 * Windows 95 computer page stay on the host's disk and are git-ignored.
 *
 * Disabled when GITHUB_TOKEN / GITHUB_REPO are unset, so local development
 * writes to disk only.
 */

const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;                                  // "owner/name"
const BRANCH = process.env.GITHUB_BRANCH || 'main';
// Where this server's directory sits inside the repository.
const REPO_PREFIX = process.env.GITHUB_CONTENT_PREFIX || 'personal-site/server';

const API = 'https://api.github.com';
const MAX_ATTEMPTS = 3;

function isEnabled() {
    return Boolean(TOKEN && REPO);
}

/** Map an absolute path under this directory to its path inside the repository. */
function toRepoPath(absolutePath) {
    const relative = path.relative(__dirname, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Refusing to sync a path outside the server directory: ${absolutePath}`);
    }
    return path.posix.join(REPO_PREFIX, relative.split(path.sep).join('/'));
}

/** Each segment is encoded separately so that '/' stays a separator. */
function encodePath(repoPath) {
    return repoPath.split('/').map(encodeURIComponent).join('/');
}

async function request(method, repoPath, { body, query } = {}) {
    const url = `${API}/repos/${REPO}/contents/${encodePath(repoPath)}${query ? `?${query}` : ''}`;
    return fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
}

/** Current blob SHA of a file in the repository, or null when it doesn't exist yet. */
async function getSha(repoPath) {
    const response = await request('GET', repoPath, { query: `ref=${encodeURIComponent(BRANCH)}` });
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`GitHub GET ${repoPath} failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.sha;
}

/**
 * Create or replace a file in the repository.
 * Retries on 409, which is what GitHub returns when the SHA went stale
 * because another upload committed in between.
 */
async function commit(method, repoPath, payload) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const sha = await getSha(repoPath);

        if (method === 'DELETE' && !sha) return false;          // already gone
        const response = await request(method, repoPath, {
            body: { ...payload, branch: BRANCH, ...(sha ? { sha } : {}) }
        });

        if (response.ok) return true;
        if (response.status === 409 && attempt < MAX_ATTEMPTS) continue;

        throw new Error(`GitHub ${method} ${repoPath} failed: ${response.status} ${await response.text()}`);
    }
    return false;
}

/**
 * Commit a file that was just written to disk.
 * `[skip ci]` keeps content commits from triggering a redeploy - the file is
 * already on the host, the commit is only there to make it durable.
 */
async function syncFile(absolutePath, contents, message) {
    if (!isEnabled()) return false;
    const repoPath = toRepoPath(absolutePath);
    return commit('PUT', repoPath, {
        message: `${message} [skip ci]`,
        content: Buffer.from(contents).toString('base64')
    });
}

/** Commit a JSON content file, formatted the same way it is written to disk. */
async function syncJson(absolutePath, value, message) {
    return syncFile(absolutePath, JSON.stringify(value, null, 2), message);
}

/** Remove a file from the repository. Missing files are treated as success. */
async function removeFile(absolutePath, message) {
    if (!isEnabled()) return false;
    const repoPath = toRepoPath(absolutePath);
    return commit('DELETE', repoPath, { message: `${message} [skip ci]` });
}

module.exports = { isEnabled, syncFile, syncJson, removeFile };
