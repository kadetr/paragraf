# paragraf — AI Primer
updated: 261115-1300

Paste this file at the start of a Claude.ai or Gemini session when working without full context.
For deeper work, attach `methodology.md` first, then the relevant `inner-context/[package]/` folder and the active plan.

---

## Project
paragraf — open-source print-ready JavaScript/TypeScript typesetting engine.
Produces PDF-quality output. Runs in Node.js; the types, color, linebreak, layout, style and render-core packages also run in a browser. Not a TeX wrapper, not a web renderer.

## Package Map
```
L0  types, color
L1  linebreak, font-engine, style, layout
L2  shaping-wasm, color-wasm, render-core
L3  typography, render-pdf
L4  template, compile
    demo/   (browser demo)
```

## Process Rules
TDD: write the failing test first. Test descriptions are human-authored; test code and implementations may be LLM-generated.
`npm run typecheck`, `npm test` and `npm run test:e2e` must pass before a change is merged.

## Document Index
Documents that are in this repository:

| Document | Location | Purpose |
|---|---|---|
| `README.md` | repo root | What the project is, how it compares, API overview |
| `CHANGELOG.md` | repo root | Released and unreleased changes |
| `getting-started.md` | `documents/` | First document, step by step |
| `document-model.md` | `documents/` | Document, frame and paragraph model |
| `dependency.md` | `documents/` | Package dependency graph |
| `io-schemas.md` | `documents/` | Input and output types per package |
| `architecture.png` | `documents/` | Layer diagram |
| `new-approach/` | `documents/new-approach/` | Documentation restructuring (in progress) |
| Package READMEs | `<package>/README.md` | Per-package API |

The maintainer's process documents (methodology, work pool, roadmap, plans, archive) are kept in local `methodology/` and `internal/` folders that are git-ignored. They are not in a clone of this repository; ask the maintainer if a session needs them.

## Note
This file is intentionally minimal. It is a navigation aid, not a reference document.
For independent opinion — use without any other context files attached.
