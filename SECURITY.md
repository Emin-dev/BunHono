# Security policy

## Supported scope

BunHono is a single-user local demo. Security maintenance targets the current `main` branch; historical commits are not supported releases. There is no authentication, authorization, encryption of stored records, or multi-user isolation.

- Keep the server bound to loopback and avoid public tunnels or public hosting.
- Do not store personal, confidential, or production data in this demo.
- Authenticate and authorize every operation, review proxy/origin behavior, add abuse controls, and configure persistent storage/backups before any public deployment.
- Third-party CDN scripts/styles and card images are loaded by the browser. Their availability and privacy behavior are outside this application.

## Defensive controls

Todo fields are escaped at the HTML output boundary. Form fields, status values, numeric IDs, and body sizes are bounded. Hono's CSRF middleware checks mutation request origins. SQL values use bound parameters; dynamic update column names are selected only by application code.

Tests explicitly construct temporary databases and do not import the production entry point. CI skips the legacy tracked SQLite file, uses synthetic records, and does not deploy. The Docker image excludes database files and environment files. These controls do not replace access control for a public service.

## Data handling

The existing tracked `todos.sqlite` is preserved without inspecting or rewriting its contents. Do not commit new databases, journals, credentials, or environment files. Git ignore rules do not remove files already tracked or erase past commits. If a real-data exposure is suspected, use a private reporting channel and arrange backup/remediation before changing history or deleting files.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option in the repository's Security tab if it is available. If private reporting is unavailable, open a minimal issue requesting a private contact channel, without exploit details, credentials, or data. Do not post sensitive records in public issues.

Include the affected commit, a description of the behavior, and minimal steps using synthetic data. Do not test a live deployment or another person's records without explicit authorization.

## Dependency review

The October 2026 maintenance review updates Hono to 4.13.13 and Bun to 1.4.2 while retaining TypeScript 5.9.3. The lockfile is committed, and CI uses a frozen install. Review upstream advisories and run the isolated checks when changing versions:

- [Hono releases](https://github.com/honojs/hono/releases)
- [Hono security advisories](https://github.com/honojs/hono/security/advisories)
- [Bun releases](https://bun.com/blog)

Advisory reachability depends on application usage. For example, Hono's dot-notation parsing advisory requires an option this app does not enable. Version updates and dependency audits should not be described as proof that every advisory was exploitable here or that the application is vulnerability-free.
