# mxrjup

Personal site: an Angular front end, an Express server that also serves a React
"Windows 95" app under `/computer`, and a Sveltia CMS back office at `/admin`.
Generated with [Angular CLI](https://github.com/angular/angular-cli) 21.1.2.

```
src/           Angular app            server/       Express: API, visitor data store
public/        static + /admin        computer-app/ React (Vite) Windows 95 app
scripts/       Spotify timeline sync  dist/         build output (git-ignored)
```

## Local setup

The site is three repositories, one per owner, and this one holds only code:

| Repository | Holds | Written by |
| --- | --- | --- |
| `mxrjup/mxrjup` (this one) | code | developers |
| [`mxrjup/mxrjup-content`](https://github.com/mxrjup/mxrjup-content) | `data/*.json` and `uploads/` | Sveltia CMS, the Spotify sync |
| `mxrjup/mxrjup-visitors` (private) | files, desktop index and chat of `/computer` | the server |

Clone them side by side - that is where the server looks by default:

```bash
git clone git@github.com:mxrjup/mxrjup.git
git clone git@github.com:mxrjup/mxrjup-content.git
git clone git@github.com:mxrjup/mxrjup-visitors.git   # or just: mkdir mxrjup-visitors
cd mxrjup && npm install
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

The backend reads `server/.env`. Locally you write it by hand; on the host the deploy
writes it from the Actions secrets or variables of this repository (*Settings > Secrets
and variables > Actions*), which have the same names - see *Deploying*.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Managed hosting assigns this at runtime |
| `NODE_ENV` | no | - | `production` on the host (the deploy's default): errors answer without a stack trace |
| `CONTENT_DIR` | no | `../mxrjup-content` | Checkout of the content repository (must contain `data/`) |
| `VISITORS_DIR` | no | `../mxrjup-visitors` | Where visitor uploads and data are written; outside this checkout. Also read by the nightly backup |
| `USER_UPLOADS_QUOTA_MB` | no | `100` | Total quota for guest uploads on `/computer` |
| `MAX_FILE_SIZE_MB` | no | `10` | Per-file cap on guest uploads |
| `TRUST_PROXY` | no | `1` | Reverse proxies in front of the server, for the visitor's IP; see *Visitor uploads* |

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
- **Rate limits, per IP**: 10 uploads per 15 minutes, 20 chat messages per minute over
  REST, 30 deletes/moves/folder creations per 15 minutes; then 429. A WebSocket connection
  may send 20 messages a minute, in frames of at most 4 KB (a larger one closes it). Chat
  messages are capped at 500 characters and names at 30, over REST and WebSocket alike.

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
repository, and `scripts/backup-visitors.sh` commits it every night:

```
30 3 * * * /path/to/mxrjup/scripts/backup-visitors.sh >> /path/to/backup-visitors.log 2>&1
```

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
`NODE_BIN` and `GIT_BIN` point cron at `node` and `git` if its `PATH` lacks them. The
push goes over SSH with a deploy key restricted to that one repository, through a host
alias (`git@github.com-mxrjup-visitors:mxrjup/mxrjup-visitors.git`) so it does not
interfere with the host's other keys.

An upload lands in `uploads/` in one atomic rename, so a backup never sees it
half-written. One stored between the index update and the commit may be committed
without its index entry, or the other way round; the next night's backup catches up.

**Size.** Git keeps every version of every file, including the ones visitors deleted,
so the repository grows with everything ever uploaded, not with the 100 MB quota. At
that scale it is acceptable; if it ever is not, the history can be squashed to the
current state (a force push, done by hand, on this repository only).

**Restoring on a new host.** Clone the repository where `VISITORS_DIR` points, then
start the server; nothing else is needed:

```bash
git clone git@github.com-mxrjup-visitors:mxrjup/mxrjup-visitors.git /path/to/visitors
# VISITORS_DIR=/path/to/visitors as an Actions secret, then deploy (it writes server/.env)
```

The server recreates the empty `uploads/` directory git does not keep. Install the
deploy key and the crontab line above before the first night.

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

Code and content ship separately: a tag deploys the code, a push to the content
repository publishes the content. Neither overwrites anything on the host in silence.

**Code: push a tag.** `.github/workflows/deploy.yml` runs on a `v*` tag (or by hand
from the Actions tab, on the branch or tag you pick) and, over SSH on the host:

1. refuses to go on if `git status --porcelain` is not empty in the code checkout;
2. `git fetch origin --tags`, then `git checkout --detach <commit of the run>` -
   no `--force`, no `reset --hard`;
3. `npm ci` (the root `postinstall` runs `npm ci` in `server/` and `computer-app/`),
   `npm run build`, checks the tree is still clean;
4. writes `server/.env` from the repository's Actions secrets and variables, then
   touches `tmp/restart.txt`.

The server's configuration therefore lives on GitHub: change it there, then deploy (a
tag, or a manual run on the current tag) for it to reach the host. Each value is taken
from the secret of that name, else the variable. The paths are secrets, since this
repository and its workflow logs are public, and the log shows only the names written.
`CONTENT_DIR` and `VISITORS_DIR` must be set, as absolute paths, or the deploy stops
before connecting; the others are written only when set.
Infomaniak's Node.js sites accept no SSH key, so the workflow logs in with the SSH
user's password.

```bash
git tag v1.2.0 && git push origin v1.2.0
```

To roll back, run the workflow by hand and pick the previous tag in *Use workflow from*.
Merging to `main` deploys nothing.

**Content: nothing to do.** Every push to `main` of `mxrjup/mxrjup-content` (a CMS
save, a hand edit, the Spotify sync) runs its `.github/workflows/publish.yml`, which
does `git pull --ff-only` in the host's `CONTENT_DIR`. There is no build and no
restart: the server rereads `data/*.json` on every request and serves `uploads/` from
disk, so the change is live as soon as the pull ends, a few seconds after the push.
Browsers do not hold on to it either: `/api/data/*` and the editorial media under
`/uploads/` are sent with `Cache-Control: no-cache` and an ETag, so they revalidate (a
`304` when nothing changed) instead of showing a stale copy - an image replaced in the
CMS keeps its name.
The app shells (`index.html`) stay `no-store`; the hashed bundles keep the default.

What happens in each case:

| Situation | Result |
| --- | --- |
| Tag `v*` pushed | The code checkout moves to the tagged commit, is installed, built and restarted. Content and visitor data are untouched: they live outside the checkout. |
| Content pushed to `main` | `CONTENT_DIR` fast-forwards to it; live on the next request. The code is not rebuilt or restarted. |
| Local change in the code checkout (edited or stray file) | The deploy fails with *"The server has local changes"* and the list of files, before touching anything: same commit, same build, no restart. Commit the change to the repository or discard it on the host, then run the deploy again. |
| Local change in the content checkout | The publish fails with *"has local changes"*, before pulling. Same remedy. |
| Content history diverged (a commit made on the host, or `main` rewritten) | The publish fails with *"has diverged from origin/main"*; nothing is merged and the site keeps serving what it had. Compare with `git log --oneline --graph HEAD origin/main` on the host, then fix it there by hand. |
| The install or build leaves a file git sees | The deploy fails before the restart (the old process keeps running). Ignore or commit the file, tag again. |
| The commit is not on the host after the fetch | The deploy fails before the checkout. |

Deploys queue rather than overlap, and so do publishes. Visitor data is not deployed
at all; for its backup and restore, see the section on visitor data backups.

## Setting up a new server

On Infomaniak (web hosting with a Node.js site), in this order. The commands run in
the Manager's web console or over SSH with the user of step 2.

1. **Create the Node.js site in Node 24.** Pick Node 24 when you create it - it is the
   version the site is built for. In its Node.js settings: execution folder `./mxrjup`,
   launch command `node server/server.js`, build command empty (the deploy builds);
   the site gives the port in `PORT`. Check that `node -v` in the console also says
   24: the deploy runs `npm ci` and the build from that shell.
2. **Create an FTP + SSH user** for the site (Node.js sites get none by default). SSH
   keys are not available on Node.js sites, so the deploys log in with its password.
3. **Lay out the three repositories** side by side in the site's folder, the code in
   `mxrjup/` (the execution folder). Content and visitor data sit next to the code,
   never inside it: the server refuses a `VISITORS_DIR` inside the code checkout, and
   anything added there makes `git status` dirty, which stops every deploy. This is
   also the layout the server's defaults expect.

   ```
   ~/sites/<domain>/
   ├── mxrjup/            CODE_DIR      git clone https://github.com/mxrjup/mxrjup.git
   ├── mxrjup-content/    CONTENT_DIR   git clone https://github.com/mxrjup/mxrjup-content.git
   └── mxrjup-visitors/   VISITORS_DIR  see the visitor data backup section
   ```

   The code and content repositories are public: HTTPS, no credentials on the host.
   Leave the content checkout on `main`. For `VISITORS_DIR`, an empty directory is
   enough to start (the server creates what it needs); to bring back existing visitor
   data or set up the nightly backup, follow the visitor data backup section. Note the
   absolute paths (`pwd` in each): they go into the secrets below.
4. **Tell GitHub about the host.** Add the Actions *secrets*:

   | Secret | `mxrjup/mxrjup` | `mxrjup/mxrjup-content` |
   | --- | --- | --- |
   | `CONTENT_DIR` (absolute path of `mxrjup-content`) | yes | - |
   | `VISITORS_DIR` (absolute path of `mxrjup-visitors`) | yes | - |
   | `INFOMANIAK_HOST` (SSH host shown in the Manager) | yes | yes |
   | `INFOMANIAK_USER` (the user of step 2) | yes | yes |
   | `INFOMANIAK_SSH_PASSWORD` (its password) | yes | yes |
   | `INFOMANIAK_SITE_PATH` (absolute path of `CODE_DIR`) | yes | - |
   | `INFOMANIAK_CONTENT_PATH` (absolute path of `CONTENT_DIR`) | - | yes |

   and, in `mxrjup/mxrjup`, the Actions *variables* (secrets work too; see
   *Configuration*):

   | Variable | Value |
   | --- | --- |
   | `USER_UPLOADS_QUOTA_MB` | `100` |
   | `MAX_FILE_SIZE_MB` | `10` |
   | `TRUST_PROXY` | only if the `Proxy check:` log line asks for it |
   | `NODE_ENV` | leave unset: the deploy writes `production` |

5. **First deploy.** Push a tag (or run *Deploy to Infomaniak* by hand on the latest
   one): it checks out the tag, installs, builds and writes `server/.env`. If the site
   was not started yet, or does not restart through `tmp/restart.txt`, start or
   restart it from the Manager. Then check: `curl -I https://<site>/api/data/reviews`
   answers `200` with `Cache-Control: no-cache`, and the site's logs show the
   `Content from` and `Visitor data in` lines with the right paths. The server refuses
   to start if `CONTENT_DIR/data` is missing or `VISITORS_DIR` is inside the code
   checkout. Run *Publish content* by hand once in `mxrjup/mxrjup-content` to check
   its side.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
