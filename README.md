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
| `VISITORS_DIR` | no | `../mxrjup-visitors` | Where visitor uploads and data are written; outside this checkout |
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

Code and content ship separately: a tag deploys the code, a push to the content
repository publishes the content. Neither overwrites anything on the host in silence.

**Code: push a tag.** `.github/workflows/deploy.yml` runs on a `v*` tag (or by hand
from the Actions tab, on the branch or tag you pick) and, over SSH on the host:

1. refuses to go on if `git status --porcelain` is not empty in the code checkout;
2. `git fetch origin --tags`, then `git checkout --detach <commit of the run>` -
   no `--force`, no `reset --hard`;
3. `npm ci` (the root `postinstall` runs `npm ci` in `server/` and `computer-app/`),
   `npm run build`, checks the tree is still clean, then touches `tmp/restart.txt`.

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

On Infomaniak (web hosting with a Node.js site), in this order:

1. **Create the Node.js site in Node 24.** Pick Node 24 when you create it - it is the
   version the site is built for. Its start command is `node server/server.js`, run
   from the code checkout (step 2); the site gives the port in `PORT`. Enable SSH on
   the hosting and check that `node -v` in an SSH session also says 24: the deploy
   runs `npm ci` and the build from that shell.
2. **Clone the three repositories** over SSH, outside one another, for example in
   the site's home:

   ```bash
   git clone https://github.com/mxrjup/mxrjup.git mxrjup                 # CODE_DIR
   git clone https://github.com/mxrjup/mxrjup-content.git mxrjup-content # CONTENT_DIR
   mkdir mxrjup-visitors                                                 # VISITORS_DIR
   ```

   The code and content repositories are public: HTTPS, no key on the host. Leave the
   content checkout on `main`. For `VISITORS_DIR`, an empty directory is enough (the
   server creates what it needs); to bring back existing visitor data or set up the
   nightly backup, follow the visitor data backup section instead.
3. **Write `server/.env`** in the code checkout (see *Configuration*), with absolute
   paths - the defaults only fit a local setup:

   ```
   CONTENT_DIR=/absolute/path/to/mxrjup-content
   VISITORS_DIR=/absolute/path/to/mxrjup-visitors
   USER_UPLOADS_QUOTA_MB=100
   MAX_FILE_SIZE_MB=10
   ```

   It is git-ignored, so deploys never see it.
4. **First start.** In the code checkout, on the latest tag:

   ```bash
   git checkout --detach v1.2.0      # the latest tag
   npm ci && npm run build
   git status --porcelain            # must print nothing
   mkdir -p tmp && touch tmp/restart.txt
   ```

   Start the site from the Infomaniak panel if it is not running, then check it:
   `curl -I https://<site>/api/data/reviews` answers `200` with
   `Cache-Control: no-cache`, and the site's logs show the `Content from` and
   `Visitor data in` lines with the right paths. The server refuses to start if
   `CONTENT_DIR/data` is missing or `VISITORS_DIR` is inside the code checkout.
5. **Let GitHub in.** Create an SSH key pair for deploys, add the public key to
   `~/.ssh/authorized_keys` on the host, then add the secrets:

   | Secret | `mxrjup/mxrjup` | `mxrjup/mxrjup-content` |
   | --- | --- | --- |
   | `INFOMANIAK_HOST` | yes | yes |
   | `INFOMANIAK_USER` | yes | yes |
   | `INFOMANIAK_SSH_KEY` (private key) | yes | yes |
   | `INFOMANIAK_SITE_PATH` (absolute path of `CODE_DIR`) | yes | - |
   | `INFOMANIAK_CONTENT_PATH` (absolute path of `CONTENT_DIR`) | - | yes |

   Check both by running each workflow once by hand from its Actions tab.

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
