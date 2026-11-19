# Learn SQL

Learn to think in SQL as sets, not loops. Each lesson puts a table on a hand-drawn isometric grid:
every row is a bar you can turn and shuffle, and every `WHERE` condition lights the field it reads
on every row at once, so `AND`, `OR` and `NOT` show up as intersection, union and complement.

Live at <https://learn-sql.lelouvincx.com>. [PRODUCT.md](PRODUCT.md) says who it is for and lists
the seven-lesson curriculum; lesson 1, *Sets & subsets*, is built and the rest are stubs. The site
publishes the same file at `/product.md`.

## Run it

```bash
.agents/setup        # or: npm ci
npm run dev          # regenerate tokens, then serve locally
npm run build        # design gate, then build for Cloudflare
npm run deploy       # build, then deploy the Worker to learn-sql.lelouvincx.com
```

Queries run in the browser on a fresh SQLite database ([sql.js](https://sql.js.org)) for every run.

## Deployment

Every push to `main` automatically deploys to <https://learn-sql.lelouvincx.com> through
GitHub Actions after the shell lifecycle and application checks pass. Pull requests and other
branches run checks only. Failed checks block deployment.

Main runs are queued rather than canceled or run concurrently, so rapid pushes retain their
deployments (up to GitHub's limit of 100 pending runs). The repository Actions secret
`CLOUDFLARE_API_TOKEN` supplies the deployment credential; the account and Worker are set in
`cloudflare.config.ts`.

## Design system

[DESIGN.md](DESIGN.md) is the single source of truth for every colour, type style, spacing step,
radius and component. `npm run design` lints it with Google's
[`@google/design.md`](https://github.com/google-labs-code/design.md) linter, regenerates
`src/tokens.css` and `src/tokens.js`, and fails if the stylesheet or the scripts use a value that is
not a token. `npm run lint` runs the same checks without writing, and CI runs it on every push.

## Credits

The 3D figure is drawn with the Colorfigures engine by April Zhu (`public/core.js`, MIT, see
[COLORFIGURES-LICENSE](COLORFIGURES-LICENSE)).

## License

[MIT](LICENSE) © 2026 Chinh Dinh (dinhminhchinh3357@gmail.com).
