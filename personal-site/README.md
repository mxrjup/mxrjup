# PersonalSite

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.2.

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

### Migrating existing content

The files under `server/data/` are committed empty. **A deploy resets the host's
working tree to the repository, so deploying them as-is replaces whatever content is
live.** Before deploying, copy each live file into the repository and wrap its array:

```bash
# for each of timeline, history, reviews, media, cool_stuff, credits
node -e 'const a=require("./old/reviews.json");require("fs").writeFileSync("server/data/reviews.json",JSON.stringify({items:a},null,2))'
```

The server reads both shapes, so a bare array still works if you would rather not
convert - but the CMS needs the `items` key to see the entries.

## Content storage

Admin content is versioned in git: the JSON files under `server/data/` and the media
under `server/uploads/` are tracked, and the CMS commits changes to them directly.

Guest uploads from the `/computer` page are deliberately *not* versioned: they are
anonymous and this repository is public. They live on the host's disk under
`server/uploads/users/`, with their index in `server/data/computer_files.json`, both
git-ignored.

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
