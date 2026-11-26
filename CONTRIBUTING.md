# Contributing

Thanks for looking at paragraf. Bug reports, fixes and small improvements are welcome. For anything larger, open an issue first so we can agree on the direction.

## Setup

You need Node.js 22 and, for the WASM packages, a Rust toolchain with the `wasm32-unknown-unknown` target and `wasm-pack` 0.14.0. These are the same steps CI runs (`.github/workflows/ci.yml`):

```sh
npm ci
npm run verify-fonts
(cd 2a-shaping-wasm/wasm && wasm-pack build --target nodejs --out-dir pkg)
(cd 2a-shaping-wasm/wasm && wasm-pack build --target bundler --out-dir pkg-bundler)
npm run build
npm run typecheck
npm test --workspaces --if-present
npm run test:e2e
```

Run `npm run format:check -- <files>` on files you changed (CI runs `npx prettier --check .` on the whole repository and fails on any unformatted file), and `node scripts/pack-check.mjs --out <dir>` if you touched a package's `package.json` or build output.

## Branches and pull requests

`main` is protected. Work on a branch, open a pull request, and wait for the `test` check to pass; it must be green before merge. Keep a pull request to one change.

- Add an entry to `CHANGELOG.md` for any change a user can see: output, API, defaults, or behaviour.
- State in the pull request whether PDF, SVG or JSON export files change. If they do, say how and why; golden snapshots are updated with `npm run golden:update` and the diff reviewed.
- Add or update tests for the change.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
