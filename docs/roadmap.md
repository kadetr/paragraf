# Extraction Roadmap

## Current state

| Package | Folder | npm name | Status |
|---|---|---|---|
| types | `0-types` | `@paragraf/types` | ✅ done |
| linebreak | `1a-linebreak` | `@paragraf/linebreak` | ✅ done |
| font-engine | `1b-font-engine` | `@paragraf/font-engine` | ✅ done |
| shaping-wasm | `2a-shaping-wasm` | `@paragraf/shaping-wasm` | ✅ done |
| render-core | `2b-render-core` | `@paragraf/render-core` | ✅ done |
| typography | `3a-typography` | `@paragraf/typography` | ✅ done |
| render-pdf | `3b-render-pdf` | `@paragraf/render-pdf` | ✅ done |
| color | `0-color` | `@paragraf/color` | ✅ done (standalone, no deps on other @paragraf packages) |
| `1-knuth-plass` | — | — | monolith (will be deleted) |

## What's inside `1-knuth-plass` to split apart

| File(s) | Concern | External deps |
|---|---|---|
| `linebreak.ts`, `traceback.ts`, `nodes.ts`, `compose.ts` | Pure algorithm | none |
| `hyphenate.ts` | Hyphenation dicts | `hyphen` |
| `font-engine.ts` | Interface only | none |
| `engines/fontkit-engine.ts`, `measure.ts` | Font metrics via fontkit | `fontkit` |
| `engines/wasm-engine.ts`, `wasm-binary.ts`, `wasm/` | Rust/WASM shaping | wasm binary |
| `paragraph.ts`, `optical-margin.ts` | Compositor / orchestrator | all of the above |
| `render.ts` | Canvas/SVG layout output | font-engine |
| `pdf.ts` | PDF output | `pdfkit` |
| `document.ts` | Document model | render + paragraph |

---

## Extraction steps

### Step 1 — `1a-linebreak`
Pure Knuth-Plass + hyphenation. No font deps, no WASM.
Files: `linebreak.ts`, `traceback.ts`, `nodes.ts`, `compose.ts`, `hyphenate.ts`
Deps: `@paragraf/types`, `hyphen`
Browser-safe, importable standalone.

### Step 2 — `1b-font-engine`
Font metrics abstraction + fontkit adapter + measurer.
Files: `font-engine.ts`, `engines/fontkit-engine.ts`, `measure.ts`
Deps: `@paragraf/types`, `fontkit`
Sits between the algorithm and the compositor.

### Step 3 — `2a-shaping-wasm` → `@paragraf/shaping-wasm`
Rust/WASM shaping engine.
Files: `engines/wasm-engine.ts`, `wasm-binary.ts`, `wasm/`
Deps: `@paragraf/font-engine`
Peers with font-engine — swappable backend.

### Step 4 — `2b-render-core` → `@paragraf/render-core`
Canvas/SVG layout output. Browser-safe.
Files: `render.ts`
Deps: `@paragraf/types`, `@paragraf/font-engine`

### Step 5 — `3a-typography` → `@paragraf/typography`
Compositor + document model.
Files: `paragraph.ts`, `optical-margin.ts`, `document.ts`
Deps: `@paragraf/linebreak`, `@paragraf/font-engine`, `@paragraf/shaping-wasm`, `@paragraf/render-core`
Note: steps 3 and 4 must both be done before this step.

### Step 6 — `3b-render-pdf` → `@paragraf/render-pdf`
PDF output via pdfkit. Node-only.
Files: `pdf.ts`
Deps: `pdfkit`, `@paragraf/render-core`, `@paragraf/font-engine`
Note: can be done in parallel with step 5.

### Step 7 — `5-imposition` (future)
Second Rust crate. Page imposition, signature folding.
No TS code to extract yet — greenfield Rust package.

---

## Execution order

```
  ┌──────────────┐          ┌─────────────┐
  │   0-color    │          │   0-types   │
  │  (standalone)│          └──────┬──────┘
  └──────────────┘    ┌────────────┴────────────┐
                       ▼                         ▼
            ┌──────────────────┐     ┌──────────────────┐
            │  1a-linebreak    │     │  1b-font-engine  │
            └────────┬─────────┘     └────────┬─────────┘
                     │                ┌────────┴────────┐
                     │                ▼                 ▼
                     │  ┌──────────────────┐  ┌──────────────────┐
                     │  │ 2a-shaping-wasm  │  │  2b-render-core  │
                     │  └────────┬─────────┘  └────┬─────────────┘
                     │           │                  │
                     └───────────┤    ┌─────────────┤
                                 ▼    ▼             ▼
                      ┌──────────────────┐  ┌──────────────────┐
                      │  3a-typography   │  │  3b-render-pdf   │
                      └──────────────────┘  └──────────────────┘
```

`3a-typography` and `3b-render-pdf` are true layer-3 siblings — neither depends on the other.
`3b-render-pdf` was able to shed its dependency on `3a-typography` because `RenderedDocument` /
`RenderedPage` types were moved into `2b-render-core` where they belong.

---

## Updates — post-extraction

Steps 1–7 are complete. The monorepo now has 8 clean `@paragraf/*` packages with no legacy shell. The following steps cover quality, distribution, and documentation.

### Step 8 — Manual test suite (E)

Port the existing 15 manual tests from `1-knuth-plass-v0.11/manual/` to the new package architecture (all imports currently point at deleted source files). Then expand coverage with systematic parameter sweeps: font size, line height, letter spacing, column width, tolerance, looseness, alignment modes. Manual tests produce real SVG/PDF output with real fonts — they catch visual regressions and rendering correctness that mocked unit tests cannot.

Live in a new top-level `manual/` folder at the monorepo root, run with `npm run manual`.

### Step 9 — Build and publish pipeline (C)

Each package currently resolves via TypeScript sources through workspace symlinks — fine for development, not suitable for publishing. This step adds:
- `tsc` build per package → `dist/` with `.js` + `.d.ts` output
- `exports` fields updated to point at `dist/` for published builds
- A release workflow (version bumps, changelog, `npm publish` per package or as a batch)
- Decide on the publish strategy: independent versioning vs. lockstep versioning

Step 8 must be done first to confirm the public API surface is stable before locking it into a release.

### Step 10 — Documentation (B)

With a stable API (confirmed by Step 8) and publishable packages (Step 9), write:
- README per package: purpose, install, minimal usage example
- Getting started guide: full pipeline walkthrough from text input to PDF output
- Document model explanation: frames, pages, baseline grid, document composition
- Input/output schemas per package: what goes in, what comes out, what the options mean
- HTML/CSS usage notes for browser-safe packages (`@paragraf/linebreak`, `@paragraf/render-core`)

---

## Future work (unscheduled)

### Browser support for `@paragraf/shaping-wasm`

`@paragraf/shaping-wasm` is currently **Node.js-only**. The wasm-pack glue uses
`require('fs').readFileSync` and `__dirname` — both unavailable in browsers.
Making it browser-compatible requires rebuilding the crate with
`wasm-pack build --target bundler`, switching to async
`WebAssembly.instantiateStreaming`, and changing `loadShapingWasm()` to an async
API (breaking change for `createParagraphComposer`).

This will be scoped into a proper step when there is a concrete browser use-case.
Packages that are already browser-safe today: `@paragraf/types`,
`@paragraf/linebreak`, `@paragraf/render-core`.
