# paragraf — AI Primer
updated: 260419-0900

Paste this file at the start of a Claude.ai or Gemini session when working without full context.
For deeper work, attach `methodology.md` first, then the relevant `inner-context/[package]/` folder and the active plan.

---

## Project
paragraf — open-source print-ready JavaScript/TypeScript typesetting engine.
Produces PDF-quality output. Runs in Node.js and browser. Not a TeX wrapper, not a web renderer.

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
Follow `methodology.md` for all process rules.
Key principle: TDD, test descriptions human-authored, test code and implementations LLM-generated.

## Active Work
See `work-pool.md` for current workIds and status.

## Document Index
| Document | Location | Purpose |
|---|---|---|
| `methodology.md` | `docs/` | Process rules — attach first in every session |
| `methodology-reference.md` | `docs/` | Archive procedures, attachment rules, anti-patterns |
| `outer-context.md` | `docs/` | Project-level consistency checker |
| `work-pool.md` | `docs/` | Work registry |
| `roadmap.md` | `docs/` | Strategic direction and milestones |
| `glossary.md` | `docs/` | Terminology |
| `dependency.md` | `docs/` | Project-level dependencies |
| `io-schemas.md` | `docs/` | Project-level I/O types |
| `inner-context/[package]/` | `docs/inner-context/` | Per-package context folder |
| `plan/` | `docs/plan/` | Active plans |
| `archive/` | `docs/archive/` | Completed/cancelled plans, locked decisions |

## Note
This file is intentionally minimal. It is a navigation aid, not a reference document.
For independent opinion — use without any other context files attached.
