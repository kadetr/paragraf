# Extraction Roadmap

## Current state

| Package | Folder | npm name | Status |
|---|---|---|---|
| types | `0-types` | `@paragraf/types` | ✅ done |
| linebreak | `1a-linebreak` | `@paragraf/linebreak` | ✅ done |
| font-engine | `1c-font-engine` | `@paragraf/font-engine` | ✅ done |
| shaping-wasm | `1b-shaping-wasm` | `@paragraf/shaping-wasm` | ✅ done |
| render-core | `2a-render-core` | `@paragraf/render-core` | ⬜ |
| typography | `3a-typography` | `@paragraf/typography` | ⬜ |
| render-pdf | `2b-render-pdf` | `@paragraf/render-pdf` | ⬜ |
| color | `2-color` | `@paragraf/color` | standalone |
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

### Step 2 — `1c-font-engine`
Font metrics abstraction + fontkit adapter + measurer.
Files: `font-engine.ts`, `engines/fontkit-engine.ts`, `measure.ts`
Deps: `@paragraf/types`, `fontkit`
Sits between the algorithm and the compositor.

### Step 3 — `1b-shaping-wasm` → `@paragraf/shaping-wasm`
Rust/WASM shaping engine.
Files: `engines/wasm-engine.ts`, `wasm-binary.ts`, `wasm/`
Deps: `@paragraf/font-engine`
Peers with font-engine — swappable backend.

### Step 4 — `2a-render-core` → `@paragraf/render-core`
Canvas/SVG layout output. Browser-safe.
Files: `render.ts`
Deps: `@paragraf/types`, `@paragraf/font-engine`

### Step 5 — `3a-typography` → `@paragraf/typography`
Compositor + document model.
Files: `paragraph.ts`, `optical-margin.ts`, `document.ts`
Deps: `@paragraf/linebreak`, `@paragraf/font-engine`, `@paragraf/shaping-wasm`, `@paragraf/render-core`
Note: steps 3 and 4 must both be done before this step.

### Step 6 — `2b-render-pdf` → `@paragraf/render-pdf`
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
                    ┌──────────────┐
                    │   0-types    │
                    └──────┬───────┘
               ┌───────────┴───────────┐
               ▼                       ▼
    ┌────────────────┐      ┌──────────────────┐
    │  1a-linebreak  │      │  1c-font-engine  │
    └────────┬───────┘      └───────┬──────────┘
             │                  ┌───┴──────────┐
             │                  ▼              ▼
             │        ┌──────────────┐  ┌──────────────-───┐
             │        │1b-shaping    │  │  2a-render-core  │
             │        │   -wasm      │  └────────┬─────────┘
             │        └──────┬───────┘           │
             │               │                   ├──────────────────┐
             └───────────────┼───────────────────┘                  │
                             ▼                                       ▼
                  ┌─────────────────────┐             ┌─────────────────────┐
                  │   3a-typography     │             │   2b-render-pdf     │
                  └─────────────────────┘             └─────────────────────┘
```

Steps 1 and 2 are done. Steps 3 and 4 are independent of each other and can be worked in parallel. Step 5 requires both 3 and 4 to be done first. Step 6 requires only step 4.
