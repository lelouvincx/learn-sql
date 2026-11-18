# Learn SQL

Learn to think in SQL as sets, not loops. Each lesson puts a table on a hand-drawn isometric grid:
every row is a bar you can turn and shuffle, and every `WHERE` condition lights the field it reads
on every row at once, so `AND`, `OR` and `NOT` show up as intersection, union and complement.

Live at <https://learn-sql.lelouvincx.com>. Lesson 1, *Sets & subsets*, is built; the rest are
stubs.

## Run it

```bash
.agents/setup        # or: npm ci
npm run dev          # regenerate tokens, then serve locally
npm run build        # design gate, then build for Cloudflare
npm run deploy       # build, then deploy the Worker to learn-sql.lelouvincx.com
```

Queries run in the browser on a fresh SQLite database ([sql.js](https://sql.js.org)) for every run.

## Design system

[DESIGN.md](DESIGN.md) is the single source of truth for every colour, type style, spacing step,
radius and component. `npm run design` lints it with Google's
[`@google/design.md`](https://github.com/google-labs-code/design.md) linter, regenerates
`src/tokens.css` and `src/tokens.js`, and fails if the stylesheet or the scripts use a value that is
not a token. `npm run lint` runs the same checks without writing, and CI runs it on every push.

## Credits

The 3D figure is drawn with the Colorfigures engine by April Zhu (`public/core.js`, MIT, see
[COLORFIGURES-LICENSE](COLORFIGURES-LICENSE)).
