# mxrjup

Personal site: an Angular front end, an Express server that also serves a React
"Windows 95" app under `/computer`, and a Sveltia CMS back office at `/admin`.
Generated with [Angular CLI](https://github.com/angular/angular-cli) 21.1.2.

```
src/           Angular app            server/       Express: API, data, uploads
public/        static + /admin        computer-app/ React (Vite) Windows 95 app
scripts/       Spotify timeline sync  dist/         build output (git-ignored)
```

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
| `USER_UPLOADS_QUOTA_MB` | no | `1000` | Total quota for guest uploads on `/computer` |
| `MAX_FILE_SIZE_MB` | no | `10` | Per-file cap on guest uploads |
| `SPOTIFY_CLIENT_ID` | for the cron | - | Spotify app that reads your saved albums |
| `SPOTIFY_CLIENT_SECRET` | for the cron | - | Same app; needed to refresh the token |
| `SPOTIFY_REFRESH_TOKEN` | for the cron | - | Minted once, see *Music timeline* below |

The server has no admin credentials: it only reads content. Editing happens in the
CMS, which authenticates against GitHub.

## Back office

Content is edited with [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at
`/admin`, configured in `public/admin/config.yml`. It commits straight to this
repository from the browser, so a content change is a commit and a deploy is what
brings it onto the host.

Two things must be set up before it works:

1. **An OAuth proxy.** Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)
   to Cloudflare Workers (free), create a GitHub OAuth app pointing at it, and put the
   Worker URL in `backend.base_url` in `config.yml`. The CMS cannot log in without it.
2. **Content files.** Each collection edits one file under `server/data/`. The CMS
   stores entries under an `items` key, so a file looks like `{"items": [...]}`.

Uploads go to `server/uploads/` and are referenced as `/uploads/<file>`, which is what
the server serves them at.

## Content storage

Admin content is versioned in git: the JSON files under `server/data/` and the media
under `server/uploads/` are tracked, and the CMS commits changes to them directly.

Guest uploads from the `/computer` page are deliberately *not* versioned: they are
anonymous and this repository is public. They live on the host's disk under
`server/uploads/users/`, with their index in `server/data/computer_files.json`, both
git-ignored.

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
