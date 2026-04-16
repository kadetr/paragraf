# paragraf — AI Primer
updated: 260415-1430

Paste this file at the start of a Claude.ai or Gemini session when working without full context.
For deeper work on a specific package, also attach the relevant `[package]-inner-context.md` and the active plan.

---

## Project
paragraf — open-source print-ready JavaScript/TypeScript typesetting engine.
Produces PDF-quality output. Runs in Node.js and browser. Not a TeX wrapper, not a web renderer.

## Package Map
```
L0  types, color
L1  linebreak, font-engine, style, layout
L2  shaping-wasm, render-core, color-wasm
L3  typography, render-pdf
L4  template, compile
    studio/ (browser app)
    demo/   (browser demo)
```

## Process Rules
- TDD: tests before tasks, always
- Tests: human-authored
- Tasks: LLM-drafted, reviewed on exception
- Config: always user-configurable, never hardcoded
- APIs: stable externally — internal changes invisible to callers

## Active Work
- v0.4.0 release cycle
- workId 001: shaping result cache — font-engine + shaping-wasm (cancelled)

## Document Index
| File | Purpose |
|---|---|
| `outer-context.md` | Full project primer |
| `glossary.md` | Term definitions |
| `[package]-inner-context.md` | Per-package AI primer |
| `[package]-decisions.md` | Per-package decision log |
| `workId-package-type-plan-[datetime].md` | Active plans |

## Note
This file is intentionally minimal. It is a navigation aid, not a reference document.
For independent opinion — use without any other context files attached.
