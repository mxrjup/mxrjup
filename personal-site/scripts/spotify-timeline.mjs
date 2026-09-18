#!/usr/bin/env node
/**
 * Export your saved Spotify albums into server/data/timeline.json.
 *
 *   node scripts/spotify-timeline.mjs --client-id=<id> [--download] [--out=path]
 *
 * Reads GET /v1/me/albums, which returns the album plus `added_at` - the date
 * you saved it, which is what the timeline groups by. Authorisation is the
 * Authorization Code + PKCE flow: your browser logs in to Spotify directly and
 * this script only ever sees the resulting token. No password goes through it,
 * and nothing is stored on disk.
 *
 * Setup, once:
 *   1. https://developer.spotify.com/dashboard -> Create app
 *   2. Add redirect URI exactly: http://127.0.0.1:8888/callback
 *      (127.0.0.1, not localhost - Spotify rejects localhost)
 *   3. Copy the Client ID into --client-id
 *
 * Covers default to Spotify's CDN URL, which keeps several hundred images out
 * of a repository that is already large. --download fetches them into
 * server/uploads/ instead, at the cost of committing every one of them.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-library-read';

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

/**
 * Map Spotify's saved-album objects onto the timeline's shape.
 * The timeline stores no artist, so it goes in the title - which also keeps
 * titles unique, since the template tracks entries by title.
 */
export function toTimelineItems(savedAlbums) {
    return savedAlbums
        .filter((saved) => saved?.album)
        .map(({ added_at, album }) => ({
            title: `${(album.artists || []).map((a) => a.name).join(', ')} - ${album.name}`.replace(/^ - /, ''),
            date: String(added_at).slice(0, 10),
            // images are ordered widest first
            cover: album.images?.[0]?.url ?? ''
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
}

/** Open the login page in whatever the platform's default browser is. */
function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
}

/** Run the PKCE dance and resolve with an access token. */
async function authorize(clientId) {
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: SCOPE
    }).toString();

    const code = await new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const { searchParams } = new URL(req.url, REDIRECT_URI);
            const received = searchParams.get('code');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<p>${received ? 'Done - you can close this tab.' : 'No code received.'}</p>`);
            server.close();
            received ? resolve(received) : reject(new Error(searchParams.get('error') || 'No code returned'));
        });
        server.listen(8888, '127.0.0.1', () => {
            console.log('Opening Spotify login in your browser...');
            console.log(`If it does not open, go to:\n${authUrl}\n`);
            openBrowser(authUrl.toString());
        });
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            client_id: clientId,
            code_verifier: verifier
        })
    });
    if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
    return (await response.json()).access_token;
}

/** Page through the whole saved-albums library, 50 at a time. */
async function fetchSavedAlbums(token) {
    let url = 'https://api.spotify.com/v1/me/albums?limit=50';
    const all = [];

    while (url) {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        if (response.status === 429) {
            const wait = Number(response.headers.get('retry-after') || 2);
            console.log(`Rate limited, waiting ${wait}s...`);
            await new Promise((r) => setTimeout(r, wait * 1000));
            continue;
        }
        if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${await response.text()}`);

        const page = await response.json();
        all.push(...page.items);
        console.log(`  ${all.length}/${page.total}`);
        url = page.next;
    }
    return all;
}

/** Fetch every cover into server/uploads/ and rewrite the items to point at it. */
async function downloadCovers(items, uploadsDir) {
    await mkdir(uploadsDir, { recursive: true });

    for (const [i, item] of items.entries()) {
        if (!item.cover) continue;
        const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        const name = `album-${slug || i}.jpg`;

        const response = await fetch(item.cover);
        if (!response.ok) {
            console.warn(`  could not download cover for ${item.title} (${response.status}), keeping the CDN URL`);
            continue;
        }
        await writeFile(path.join(uploadsDir, name), Buffer.from(await response.arrayBuffer()));
        item.cover = `/uploads/${name}`;
        console.log(`  ${i + 1}/${items.length} ${name}`);
    }
    return items;
}

async function main() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((a) => {
            const [k, v] = a.replace(/^--/, '').split('=');
            return [k, v ?? true];
        })
    );

    const clientId = args['client-id'] || process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
        console.error('Missing --client-id=<id> (or SPOTIFY_CLIENT_ID).');
        console.error('Create an app at https://developer.spotify.com/dashboard with redirect URI');
        console.error(`  ${REDIRECT_URI}`);
        process.exit(1);
    }

    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const out = args.out ? path.resolve(args.out) : path.join(root, 'server/data/timeline.json');

    const token = await authorize(clientId);
    console.log('Fetching saved albums...');
    const saved = await fetchSavedAlbums(token);

    let items = toTimelineItems(saved);
    if (args.download) {
        console.log('Downloading covers...');
        items = await downloadCovers(items, path.join(root, 'server/uploads'));
    }

    await writeFile(out, JSON.stringify({ items }, null, 2) + '\n');
    console.log(`\nWrote ${items.length} albums to ${out}`);
    console.log(items.length ? `Newest: ${items[0].date} - oldest: ${items[items.length - 1].date}` : '');
}

// Only run when executed directly, so the mapping stays importable for tests.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
