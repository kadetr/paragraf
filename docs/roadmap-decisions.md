# Architecture Decisions

## Package structure

- **`1-knuth-plass` will be deleted** once all code has been extracted. No umbrella/meta package.
- **Package name scope**: `@paragraf/...` throughout.
- **`0-types` is a zero-dep peer** — every other package depends on it directly; no package re-exports types on behalf of another.

## Testing strategy

- **Each package owns its tests** — unit and functional tests live alongside the code they cover in a `tests/` subfolder.
- **E2E tests live at the monorepo root** in `/paragraf/tests/` — they exercise the full pipeline across multiple packages.

## Test migration map

| Test file | Moves to package |
|---|---|
| `linebreak.test.ts`, `nodes.test.ts`, `compose.test.ts`, `hyphenate.test.ts` | `1a-linebreak` |
| `measure.test.ts` | `1c-font-engine` |
| `wasm.test.ts`, `render-wasm.test.ts`, `binary-debug.test.ts`, `equivalence.test.ts` | `1b-shaping-wasm` |
| `render.test.ts`, `baseline-grid.test.ts` | `2a-render-core` |
| `pdf.test.ts`, `pdf-document.test.ts` | `2b-render-pdf` |
| `paragraph.test.ts`, `bidi.test.ts`, `optical-margin.test.ts`, `document.test.ts` | `3a-typography` |
| `e2e.test.ts` | monorepo root `tests/` |

## Shared test fixtures

- **Font files live at the monorepo root** in `/paragraf/fonts/` — not inside any package.
- Tests reference them with a relative path, e.g. `../../fonts/LiberationSerif-Regular.ttf`.
- This folder is never published and carries no package dependency.
- The existing `1-knuth-plass/fonts/` contents will be moved to `/paragraf/fonts/` during Step 1.

## Public API conventions

- Each package exports through a single `src/index.ts` barrel.
- Types from `@paragraf/types` are **not** re-exported by downstream packages — callers add `@paragraf/types` as a direct dep if they need raw types.
- Internal helpers (not part of the public contract) stay unexported.

## WASM loading strategy

`@paragraf/shaping-wasm` currently uses a **Node.js-only** loading strategy: the
wasm-pack-generated glue (`knuth_plass_wasm.js`) loads `knuth_plass_wasm_bg.wasm`
via `require('fs').readFileSync` + `__dirname`. This is the correct production
approach for server-side / Node.js callers and is not a temporary workaround.

**Browser support is explicitly deferred.** Making `@paragraf/shaping-wasm`
browser-compatible requires:
1. Rebuilding the Rust crate with `wasm-pack build --target bundler` (or `--target web`).
2. Switching from synchronous to async instantiation (`WebAssembly.instantiateStreaming`).
3. Changing `loadShapingWasm()` to an async API — which cascades into a breaking
   change for `createParagraphComposer` in `@paragraf/typography`.

This is a future work item, not a numbered step. It will be scoped and planned
when there is a concrete browser use-case (e.g. a web paragraph composer).
