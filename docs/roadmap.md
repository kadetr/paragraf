# Extraction Roadmap

## Current state

| Package | Status | Contents |
|---|---|---|
| `0-types` | ✅ done | All shared interfaces + constants |
| `1-knuth-plass` | monolith (will be deleted) | Everything else |
| `2-color` | standalone | Color math |

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

### Step 3 — `1b-shaping-wasm`
Rust/WASM shaping engine.
Files: `engines/wasm-engine.ts`, `wasm-binary.ts`, `wasm/`
Peers with `font-engine` — swappable backend.

### Step 4 — `2a-render`
Canvas/SVG layout output. Browser-safe.
Files: `render.ts`
Deps: `@paragraf/types`, `1c-font-engine`

### Step 5 — `2b-render-pdf`
PDF output via pdfkit. Node-only.
Files: `pdf.ts`
Deps: `pdfkit`, `1c-font-engine`, `2a-render`

### Step 6 — `paragraph` (compositor)
Orchestrates linebreak + font-engine + shaping.
Files: `paragraph.ts`, `optical-margin.ts`
Deps: `1a-linebreak`, `1c-font-engine`, `1b-shaping-wasm` (optional)

### Step 7 — `document`
Document model: multi-paragraph layout.
Files: `document.ts`
Deps: `paragraph`, `2a-render`

### Step 8 — `5-imposition` (future)
Second Rust crate. Page imposition, signature folding.
No TS code to extract yet — greenfield Rust package.

---

## Execution order

1 → 2 → 6 → 3 → 4 → 5 → 7

Algorithm first, then font engine, then compositor, then renderers and doc model last.
Step 3 (`1b-shaping-wasm`) can happen independently of steps 4–7.
