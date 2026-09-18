# PersonalSite

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Configuration

The backend reads `server/.env` (see `server/gitStorage.js` and `server/server.js`):

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | yes | - | Password for `/add`; the server exits at startup without it |
| `PORT` | no | `3000` | Managed hosting assigns this at runtime |
| `GITHUB_TOKEN` | production | - | Fine-grained token with read/write Contents on this repository |
| `GITHUB_REPO` | production | - | `owner/name` of the repository to commit content to |
| `GITHUB_BRANCH` | no | `main` | Branch that content is committed to |
| `MAX_ADMIN_FILE_SIZE_MB` | no | `25` | Per-file cap on `/add` uploads |
| `USER_UPLOADS_QUOTA_MB` | no | `1000` | Total quota for guest uploads on `/computer` |
| `MAX_FILE_SIZE_MB` | no | `10` | Per-file cap on guest uploads |

Without `GITHUB_TOKEN`/`GITHUB_REPO` the server writes to disk only, which is what you want locally.

## Content storage

Admin content is versioned in git: an upload on `/add` is written to `server/uploads/`
*and* committed to the repository, and the JSON files under `server/data/` are committed
on every save. The host's disk is a cache - a deploy resets the working tree to the
remote, which restores the content. Content commits carry `[skip ci]` so they do not
trigger a deploy of their own.

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
