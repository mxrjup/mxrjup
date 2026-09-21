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

The backend reads `server/.env`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Managed hosting assigns this at runtime |
| `CONTENT_DIR` | no | `../mxrjup-content` | Checkout of the content repository (must contain `data/`) |
| `VISITORS_DIR` | no | `../mxrjup-visitors` | Where visitor uploads and data are written; outside this checkout. Also read by the nightly backup |
| `USER_UPLOADS_QUOTA_MB` | no | `1000` | Total quota for guest uploads on `/computer` |
| `MAX_FILE_SIZE_MB` | no | `10` | Per-file cap on guest uploads |
| `SPOTIFY_CLIENT_ID` | for the cron | - | Spotify app that reads your saved albums |
| `SPOTIFY_CLIENT_SECRET` | for the cron | - | Same app; needed to refresh the token |
| `SPOTIFY_REFRESH_TOKEN` | for the cron | - | Minted once, see *Music timeline* below |

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
3. makes sure `.gitignore` in the clone excludes `data/.*.tmp`, the temporary files of
   the server's atomic writes;
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

A file being uploaded at 03:30 may be committed half-written. It is not in the desktop
index yet, and the next night's backup commits it whole (or its deletion).

**Size.** Git keeps every version of every file, including the ones visitors deleted,
so the repository grows with everything ever uploaded, not with the 100 MB quota. At
that scale it is acceptable; if it ever is not, the history can be squashed to the
current state (a force push, done by hand, on this repository only).

**Restoring on a new host.** Clone the repository where `VISITORS_DIR` points, then
start the server; nothing else is needed:

```bash
git clone git@github.com-mxrjup-visitors:mxrjup/mxrjup-visitors.git /path/to/visitors
# VISITORS_DIR=/path/to/visitors in server/.env, then start or restart the server
```

The server recreates the empty `uploads/` directory git does not keep. Install the
deploy key and the crontab line above before the first night.

`node --test scripts/test/*.test.js` (after `cd server && npm ci`) checks all of this
against a local bare repository with the real server: no commit when nothing changed, an
upload committed with its index entry, invalid JSON refused, and a fresh clone serving the
same computer.

## Music timeline

`/music/timeline` is two sources merged by the server:

- `server/data/timeline.json` - albums added by hand in the CMS, versioned here.
- `server/data/timeline_spotify.json` - your saved Spotify albums, rewritten weekly
  by `scripts/spotify-cron.sh` on the host. Git-ignored, so deploys leave it alone.

Entries are deduplicated by title and the manual side wins, which is how an album the
export got wrong gets corrected. Set the cron up once:

```bash
node scripts/spotify-timeline.mjs --print-refresh-token   # on a machine with a browser
```

Put the printed line in `server/.env` on the host, then add to its crontab:

```
17 5 * * 1 /path/to/mxrjup/scripts/spotify-cron.sh >> /path/to/spotify-timeline.log 2>&1
```

## Deploying

`.github/workflows/deploy.yml` ships to Infomaniak over SSH. It runs on a **tag
push** (`v*`) or a manual run from the Actions tab - merging to `main` deploys
nothing, so content committed by the CMS waits for the next tag.

```bash
git tag v1.2.0 && git push origin v1.2.0
```

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
