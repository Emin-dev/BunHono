# BunHono

A small, server-rendered todo app built with Bun, Hono, SQLite, and HTMX. Create tasks, mark them complete, and delete them without a client-side framework. The existing Pico CSS interface and image cards are retained.

This is a local learning demo. It has no accounts, authentication, or per-user ownership. Do not expose it publicly or use it to store sensitive information.

## Requirements

- [Bun 1.4.2](https://bun.com/docs/installation) or a compatible newer release
- A browser; the page loads HTMX and Pico CSS from CDNs and card images from Picsum

## Run locally

From the repository root:

```sh
bun install --frozen-lockfile --ignore-scripts
mkdir -p data
DATABASE_PATH=./data/todos.sqlite bun run start
```

Open http://127.0.0.1:3000. The selected database is created if it does not exist. Stop the server with Ctrl+C.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listening interface; keep loopback for local use |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `todos.sqlite` | SQLite file; the parent directory must exist |

The default database path is retained for compatibility. A legacy `todos.sqlite` is already tracked in this repository; it is not required for a fresh installation, and the repair does not read, migrate, or remove its records. Use the explicit fresh path above. Back up your own database before changing runtime versions or storage settings. New database files and journals are ignored by Git and excluded from container images.

## Development checks

```sh
bun run check
```

This runs strict TypeScript checking and the Bun route regression suite. Each test receives its own temporary SQLite database, which is closed and removed afterward. Importing `app.ts` or `db.ts` never opens the application database. Tests use synthetic records only.

For an additional Chromium DOM smoke test:

```sh
bunx --no-install playwright install chromium
bun run test:browser
```

The browser check verifies that stored markup stays literal and that todo controls render correctly before and after completion, and that form input survives failed requests. It uses synthetic HTML fragments and blocks browser network requests; it is not a full CDN/HTMX end-to-end or visual test. `CHROMIUM_PATH` can select an existing Chromium executable.

GitHub Actions runs the frozen install, type checking, route tests, and Chromium smoke test. It skips checkout of the legacy database and has no deployment step. No separate application build is required: Bun runs the TypeScript entry point.

## Project layout

- `index.ts`: runtime configuration and application database creation
- `app.ts`: Hono routes, input validation, and escaped HTML templates
- `db.ts`: explicit SQLite factory and row types
- `public/`: existing HTMX interface and error handling
- `index.test.ts`: isolated route/security regressions
- `scripts/browser-smoke.ts`: synthetic Chromium DOM checks

## HTTP interface

The API returns HTML fragments for HTMX, rather than JSON.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Todo page |
| GET | `/todos` | Todo list |
| POST | `/todos` | Create with `title` and optional `description` |
| PUT | `/todos/:id` | Update `title`, `description`, and/or `status` |
| DELETE | `/todos/:id` | Delete; empty successful response removes the card |

Titles must contain 1–200 characters after trimming. Descriptions allow up to 4,000 characters. Status is `pending` or `completed`, IDs must be positive safe integers, and request bodies are limited to 64 KiB. Cross-origin form requests are rejected; command-line clients should send an `Origin` matching the request URL for mutations. Stored fields are escaped when rendered, including legacy records.

## Optional local container

```sh
docker build -t bunhono .
docker run --rm -p 127.0.0.1:3000:3000 bunhono
```

The image uses a locked production install, runs as the Bun user, and starts with a fresh `/data/todos.sqlite`. Data in an unmounted container is ephemeral. Configure persistent storage and backups yourself if needed. The existing `fly.toml` is a legacy deployment example, not a reviewed production configuration. No deployment is part of these instructions.

## Security and dependencies

See [SECURITY.md](SECURITY.md) for the security boundary and reporting guidance. Hono stays on the 4.x line, TypeScript on 5.x, and the Bun lockfile pins the reviewed dependency set. Review dependency changes with the checks above; passing tests is not a guarantee of production security.
