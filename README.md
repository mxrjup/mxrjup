# mxrjup-site

Personal site: an Angular front end, an Express server that also serves a React
"Windows 95" app under `/computer`, and a Sveltia CMS back office at `/admin`.
Generated with [Angular CLI](https://github.com/angular/angular-cli) 21.1.2.

```
src/           Angular app            server/       Express: API, visitor data store
public/        static + /admin        computer-app/ React (Vite) Windows 95 app
scripts/       host build, backup     dist/         build output (git-ignored)
```

## Local setup

The site is three repositories, one per owner, and this one holds only code:

| Repository | Holds | Written by |
| --- | --- | --- |
| `mxrjup/mxrjup-site` (this one) | code | developers |
| [`mxrjup/mxrjup-content`](https://github.com/mxrjup/mxrjup-content) | `data/*.json` and `uploads/` | Sveltia CMS, the Spotify sync |
| `mxrjup/mxrjup-visitors` (private) | files, desktop index and chat of `/computer` | the server |

Clone them side by side - that is where the server looks by default:

```bash
git clone git@github.com:mxrjup/mxrjup-site.git
git clone git@github.com:mxrjup/mxrjup-content.git
git clone git@github.com:mxrjup/mxrjup-visitors.git   # or just: mkdir mxrjup-visitors
cd mxrjup-site && npm install
npm run build:computer        # only if you want /computer served by the backend
npm run start:backend         # http://localhost:3000
```

Elsewhere, set `CONTENT_DIR` and `VISITORS_DIR` in `server/.env` (absolute paths, or
relative to the root of this repository). The server refuses to start if
`CONTENT_DIR/data` is missing, or if `VISITORS_DIR` points inside this checkout. An empty
or missing `VISITORS_DIR` is fine: the server creates `data/` and `uploads/` in it. Use
a throwaway directory rather than a clone of the private repository if you do not need
real visitor data.

The server never writes inside this checkout. It reads content from `CONTENT_DIR`
(`data/<type>.json` for `GET /api/data/<type>`, `uploads/` for `/uploads/*`) and keeps
visitor data in `VISITORS_DIR` (`uploads/` for `/uploads/users/*`,
`data/computer_files.json`, `data/chat_data.json`). Every write to the visitor files goes
through `server/visitorStore.js`, which writes atomically and runs the updates of one
file one at a time. `cd server && npm test` runs the server tests.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Configuration

The backend reads `server/.env`, written by hand - locally, and on the host once, in the
Manager's web console (see *Setting up a new server*). It is git-ignored, so a deploy
never touches it; after changing it on the host, restart the site.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Managed hosting assigns this at runtime |
| `NODE_ENV` | no | - | `production` on the host: errors answer without a stack trace |
| `CONTENT_DIR` | no | `../mxrjup-content` | Checkout of the content repository (must contain `data/`) |
| `VISITORS_DIR` | no | `../mxrjup-visitors` | Where visitor uploads and data are written; outside this checkout. Also read by the nightly backup |
| `USER_UPLOADS_QUOTA_MB` | no | `100` | Total quota for guest uploads on `/computer` |
| `MAX_FILE_SIZE_MB` | no | `10` | Per-file cap on guest uploads |
| `TRUST_PROXY` | no | `1` | Reverse proxies in front of the server, for the visitor's IP; see *Visitor uploads* |
| `CONTENT_WEBHOOK_SECRET` | on the host | - | Secret shared with the content repository's webhook; unset, `POST /api/hooks/content` answers 503. See *Deploying* |
| `VISITORS_BACKUP_AT` | on the host | - | `HH:MM`, host time: the server runs the nightly visitor backup then. Unset, no backup |

The server has no admin credentials: it only reads content. Editing happens in the
CMS, which authenticates against GitHub.

## Back office

Content is edited with [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at
`/admin`, configured in `public/admin/config.yml`. It commits straight to the
`mxrjup/mxrjup-content` repository from the browser, so a content change is a commit
there, and the host's checkout of that repository is the server's `CONTENT_DIR`.

Two things must be set up before it works:

1. **An OAuth proxy.** Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)
   to Cloudflare Workers (free), create a GitHub OAuth app pointing at it, and put the
   Worker URL in `backend.base_url` in `config.yml`. The CMS cannot log in without it.
2. **Content files.** Each collection edits one file under `data/` in the content
   repository. The CMS stores entries under an `items` key, so a file looks like
   `{"items": [...]}`.

Uploads go to `uploads/` in the content repository and are referenced as
`/uploads/<file>`, which is what the server serves them at.

## Content storage

Admin content is versioned in the public `mxrjup/mxrjup-content` repository (see
*Local setup*), and the CMS commits changes to it directly.

Guest uploads from the `/computer` page are anonymous, so they stay out of the public
repositories: they live in `VISITORS_DIR`, whose nightly backup is a commit to the
private `mxrjup/mxrjup-visitors` repository.

## Visitor uploads

Anyone can put a file on `/computer`, and it is served from this domain, so the server
decides what gets in (`server/uploadPolicy.js`) and how it is served (`server/server.js`):

- **Received in memory.** Nothing is written to disk until every check below has passed,
  so a refused file is never on disk, not even in a temporary directory.
- **Type from the bytes.** [`file-type`](https://github.com/sindresorhus/file-type) reads
  the file's signature; the name and the `Content-Type` the browser sent are ignored.
  Accepted: JPEG, PNG, GIF, WebP (the photo viewer), MP3, OGG, WAV, MP4 and WebM (played
  by the browser in the Internet window). Everything else is a 415, SVG, HTML, XML and
  PDF included. A file that also contains markup (`<script`, `<html`, `<svg`...) is
  refused too, so a polyglot is not left to the headers alone.
- **Images are re-encoded** with [`sharp`](https://sharp.pixelplumbing.com/) and only the
  copy is kept: no EXIF (GPS position included), no metadata, no trailing data. The EXIF
  orientation is applied to the pixels first; animated GIF and WebP keep their frames.
  An image sharp cannot decode, or whose format disagrees with its signature, is refused.
- **Audio and video are kept as sent.** Re-encoding them would need ffmpeg on the host;
  a checked signature, a fixed `Content-Type` and the headers below are enough for files
  the browser only ever plays.
- **Names.** The file is stored as `<32 random hex>.<extension of the detected type>`.
  The visitor's name is kept in the index for display only, without its path, control
  characters or bidi overrides, and cut to 100 characters.
- **Quota.** Usage is the sum of the sizes in the desktop index. A request whose
  `Content-Length` would not fit is refused before its body is read; the real size is
  checked again in the same serialized index update that writes the file, so two uploads
  racing each other cannot both take the last free space. Both answer 413.
- **Headers.** Everything under `/uploads/users/` is served with `nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy:
  same-origin` and a `Content-Type` from the extension. A file with any other extension
  (uploaded before these rules) is sent as `application/octet-stream`, as an attachment.
  The rest of the site gets `nosniff` too.
- **Rate limits, per IP**: 10 uploads per 15 minutes, 30 deletes/moves/folder creations
  per 15 minutes; then 429. The chat goes over the WebSocket only: a connection may send
  20 messages a minute, in frames of at most 4 KB (a larger one closes it). Chat messages
  are capped at 500 characters and names at 30.

The rate limits count by `req.ip`, which is only the visitor's address if Express knows
how many proxies stand in front of the server: otherwise every visitor shares the
proxy's address, and one budget. `TRUST_PROXY` is that number (`1` by default, the
host's reverse proxy). On each start, the server logs one `Proxy check:` line for its
first request, with the address it came from and the number of `X-Forwarded-For`
entries: `TRUST_PROXY` must equal that number. Too high, and a visitor can pick their own
address by sending the header; `true` is refused for that reason.

`sharp` is the one native dependency. It ships prebuilt binaries (Node-API, so not tied
to a Node version) for linux-x64 with glibc 2.28 or later, and for musl; nothing is
compiled on install. `file-type` is ESM-only and is loaded with a dynamic `import()`.

`VISITORS_DIR` must not be inside a directory the host serves itself (a PHP or static
web root): only this server's headers make the files safe.

## Visitor data backup and restore

On the host, `VISITORS_DIR` is a clone of the private `mxrjup/mxrjup-visitors`
repository, and `scripts/backup-visitors.sh` commits it every night. The host has no
crontab, so the server starts it itself: with `VISITORS_BACKUP_AT=03:30` in
`server/.env`, it runs the script every day at 03:30 (the host's time, probably UTC),
with its own `VISITORS_DIR` and `node`, and copies every line of its output to the
server log, prefixed `[backup]` (`server/backupSchedule.js`). A run can also be started
by hand in the console.

Each run:

1. reads `VISITORS_DIR` from the environment, then `server/.env` (without sourcing it),
   then the `../mxrjup-visitors` default, like the server;
2. refuses to run unless `VISITORS_DIR` is the root of its own clone, on a branch, with
   an `origin` remote, and holds `data/computer_files.json` and `data/chat_data.json` -
   so a wrong path is never committed as "every visitor file was deleted";
3. makes sure `.gitignore` in the clone excludes `data/.*.tmp` and `uploads/.*.tmp`, the
   temporary files of the server's atomic writes, adding whichever rule is missing;
4. stages everything (`git add -A`) and parses every staged `data/*.json`. If one does
   not parse, it unstages, waits and tries again (`BACKUP_ATTEMPTS`, default 3, every
   `BACKUP_RETRY_DELAY` seconds, default 10), then gives up without committing;
5. commits only if something changed, as `mxrjup backup`, with a UTC timestamp;
6. pushes, on every run, so a night whose push failed is sent the next night. It never
   pulls, merges or forces: if the push is rejected, someone pushed to the repository by
   hand, and that is sorted out by hand in the clone.

Every failure exits non-zero with a line starting with `BACKUP FAILED:` in the log.
`NODE_BIN` and `GIT_BIN` point the script at `node` and `git` when run where `PATH`
lacks them. The push goes over HTTPS with a fine-grained GitHub token limited to that
one repository (*Contents: read and write*), stored in the clone's remote URL on the
host - Infomaniak's Node.js sites take no SSH key. The token expires: renew it and
update the URL (`git -C <VISITORS_DIR> remote set-url origin ...`) before it does.

An upload lands in `uploads/` in one atomic rename, so a backup never sees it
half-written. One stored between the index update and the commit may be committed
without its index entry, or the other way round; the next night's backup catches up.

**Size.** Git keeps every version of every file, including the ones visitors deleted,
so the repository grows with everything ever uploaded, not with the 100 MB quota. At
that scale it is acceptable; if it ever is not, the history can be squashed to the
current state (a force push, done by hand, on this repository only).

**Restoring on a new host.** Clone the repository where `VISITORS_DIR` points, before
the site first starts, then start it; nothing else is needed:

```bash
git clone https://x-access-token:<token>@github.com/mxrjup/mxrjup-visitors.git mxrjup-visitors
```

The server recreates the empty `uploads/` directory git does not keep.

`node --test scripts/test/*.test.js` (after `cd server && npm ci`) checks all of this
against a local bare repository with the real server: no commit when nothing changed, an
upload committed with its index entry, invalid JSON refused, and a fresh clone serving the
same computer.

## Music timeline

`/music/timeline` is one file, `data/timeline.json` of the content repository, served
by `GET /api/data/timeline` like every other collection except that entries with
`"hidden": true` are left out.

The file is edited in the CMS and fed by a weekly workflow of the content repository
(`.github/workflows/spotify-timeline.yml`, Mondays 05:17 UTC), which appends the albums
saved in Spotify and publishes the result. It only ever adds: an album already listed
(same `spotifyId`, or the same title ignoring case, accents and punctuation) is skipped,
and no entry is changed or removed - an album gone from the library stays. To take one
off the site, tick *Masquer* in the CMS instead of deleting it, or the sync adds it back.

The sync, its Spotify credentials (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
`SPOTIFY_REFRESH_TOKEN`, now secrets of the content repository, no longer in
`server/.env`) and its tests live in
[`mxrjup/mxrjup-content`](https://github.com/mxrjup/mxrjup-content); its README has the
setup. Nothing about it runs on the host.

## Deploying

Infomaniak's Node.js sites cannot be driven over SSH from GitHub Actions: they take no
SSH key, and commands sent from outside do not come back. So nothing pushes to the host.
Code is built by the host itself, and content is pulled by the server when GitHub
calls it. Neither overwrites anything on the host in silence.

**Code: push a tag, then restart the site.** The site's build command is
`bash scripts/host-build.sh`, which the Manager runs, in its build environment, before
every start of the app:

1. refuses to go on if `git status --porcelain` is not empty in the code checkout;
2. fetches the tags and checks out the newest `v*` one, in version order (`v1.10.0`
   after `v1.9.0`) - no `--force`, no `reset --hard`; a tag deleted on GitHub is
   dropped too;
3. `npm ci` (the root `postinstall` runs `npm ci` in `server/` and `computer-app/`) and
   `npm run build`;
4. checks the tree is still clean.

```bash
git tag v1.2.0 && git push origin v1.2.0
# then Restart in the Manager (the site's dashboard)
```

Merging to `main` deploys nothing, and neither does a tag until the next start. Every
start runs the build, an automatic restart after a crash included: slower, but the host
always runs the newest tag. To roll back, tag the old commit with a newer version and
restart. If the build fails, the site does not start; the reason is in the Manager's
execution console, after `BUILD FAILED:`.

**Content: nothing to do.** `mxrjup/mxrjup-content` has a webhook on every push to
`main` (a CMS save, a hand edit, the Spotify sync - webhooks, unlike workflows, fire
for pushes made with `GITHUB_TOKEN`) that calls `POST /api/hooks/content` on the site.
The server (`server/contentWebhook.js`):

1. checks GitHub's `X-Hub-Signature-256` against `CONTENT_WEBHOOK_SECRET`, and
   answers `401` otherwise; `ping` gets a `200`, other events and branches a `202`
   that does nothing;
2. answers `202` at once, then, in `CONTENT_DIR`, refuses local changes or a branch
   other than `main`, fetches, refuses a history that has diverged from `origin/main`,
   and fast-forwards;
3. runs one update at a time: pushes arriving during one cost a single extra update.

The outcome goes to the server log (`Content update: <before> -> <after>`, or
`Content update refused: <reason>`), and GitHub lists each delivery under the webhook's
*Recent Deliveries*. There is no build and no restart: the server rereads
`data/*.json` on every request and serves `uploads/` from disk, so the change is live
as soon as the pull ends, a few seconds after the push. Browsers do not hold on to it
either: `/api/data/*` and the editorial media under `/uploads/` are sent with
`Cache-Control: no-cache` and an ETag, so they revalidate (a `304` when nothing
changed) instead of showing a stale copy - an image replaced in the CMS keeps its name.
The app shells (`index.html`) stay `no-store`; the hashed bundles keep the default.

What happens in each case:

| Situation | Result |
| --- | --- |
| Tag `v*` pushed | Nothing until the site restarts; then the checkout moves to the newest tag, is installed and built, and the app starts. Content and visitor data are untouched: they live outside the checkout. |
| Content pushed to `main` | `CONTENT_DIR` fast-forwards to it; live on the next request. The code is not rebuilt or restarted. |
| Local change in the code checkout (edited or stray file) | The build fails with *"has local changes"* and the list of files, before touching anything, and the site does not start. Commit the change to the repository or discard it on the host, then restart. |
| The install or build leaves a file git sees | The build fails after it, and the site does not start. Ignore or commit the file, tag again, restart. |
| Local change in the content checkout | The update is refused (*"has local changes"*), before fetching; the site keeps serving what it had. Same remedy, then push again or redeliver the webhook from GitHub. |
| Content history diverged (a commit made on the host, or `main` rewritten) | The update is refused (*"has diverged from origin/main"*); nothing is merged and the site keeps serving what it had. Fix the checkout by hand, then redeliver. |
| Webhook with a wrong secret | `401`, nothing runs. |

Visitor data is not deployed at all; for its backup and restore, see the section on
visitor data backups.

## Setting up a new server

On Infomaniak (web hosting with a Node.js site), in this order. The commands run in
the Manager's web console.

1. **Create the Node.js site in Node 24.** Pick Node 24 when you create it - it is the
   version the site is built for. In its Node.js settings (*Advanced settings >
   Node.js*):

   | Setting | Value |
   | --- | --- |
   | Execution folder | `./mxrjup-site` |
   | Build command | `bash scripts/host-build.sh` |
   | Launch command | `node server/server.js` |

   The site gives the port in `PORT`.
2. **Lay out the three repositories** side by side in the site's folder, the code in
   `mxrjup-site/` (the execution folder). Content and visitor data sit next to the code,
   never inside it: the server refuses a `VISITORS_DIR` inside the code checkout, and
   anything added there makes `git status` dirty, which stops every build. This is the
   layout the server's defaults expect, so `CONTENT_DIR` and `VISITORS_DIR` need not be
   set.

   ```
   ~/sites/<domain>/
   ├── mxrjup-site/       git clone https://github.com/mxrjup/mxrjup-site.git
   ├── mxrjup-content/    git clone https://github.com/mxrjup/mxrjup-content.git
   └── mxrjup-visitors/   git clone https://x-access-token:<token>@github.com/mxrjup/mxrjup-visitors.git
   ```

   The code and content repositories are public: HTTPS, no credentials. Leave the
   content checkout on `main`. The visitor repository is private: the token is the
   backup's (see the visitor data backup section). Clone it before the site first
   starts, or the server fills the directory first.
3. **Write `server/.env`** in `mxrjup-site/` (see *Configuration*). The webhook secret is any
   long random string, `openssl rand -hex 32` makes one:

   ```
   NODE_ENV=production
   CONTENT_WEBHOOK_SECRET=<openssl rand -hex 32>
   VISITORS_BACKUP_AT=03:30
   ```

4. **First start.** With at least one `v*` tag pushed, start the site from the Manager
   and follow the build in its execution console. Then check:
   `curl -I https://<site>/api/data/reviews` answers `200` with
   `Cache-Control: no-cache`; the logs show `Content from`, `Visitor data in` and
   `Visitor data backup every day at 03:30`, with the right paths; the `Proxy check:`
   line gives the `TRUST_PROXY` to set if it is not 1; and `https://<site>/mxrjup-visitors/`
   lists no files.
5. **Add the content webhook.** In `mxrjup/mxrjup-content`, *Settings > Webhooks >
   Add webhook*: payload URL `https://<site>/api/hooks/content`, content type
   `application/json`, the secret of step 3, *Just the push event*. GitHub's ping must
   show a green tick under *Recent Deliveries*.
6. **Check the backup** once by hand: `bash mxrjup-site/scripts/backup-visitors.sh` ends
   with `pushed to origin/main`.
