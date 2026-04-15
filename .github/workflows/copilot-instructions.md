# paragraf — Copilot Instructions

synced-from: outer-context.md
updated: 260415-2135

---

## What This Project Is

paragraf is an open-source, print-ready JavaScript/TypeScript typesetting engine. It produces PDF-quality output from structured data and templates. Target environments: Node.js pipelines, browser-based tools, publishing automation systems. It is not a web text renderer and not a TeX wrapper.

## Architecture — Layers and Packages

```
L0   @paragraf/types          — shared type definitions
     @paragraf/color          — CMYK + RGB color model

L1   @paragraf/linebreak       — Knuth-Plass line-breaking
     @paragraf/font-engine     — font loading, glyph measurement, shaping pipeline
     @paragraf/style           — style resolution and inheritance
     @paragraf/layout          — frame and page layout

L2   @paragraf/shaping-wasm   — Rust/WASM bridge (rustybuzz); JS fallback shaper
     @paragraf/render-core    — browser-safe rendering primitives
     @paragraf/color-wasm     — WASM color operations

L3   @paragraf/typography     — paragraph and text composition
     @paragraf/render-pdf     — Node-only PDF output

L4   @paragraf/template       — template definition and resolution
     @paragraf/compile        — document compilation pipeline

     studio/                  — browser app: frame editor, style panel, data binding, live PDF preview
```

Rust source for `@paragraf/shaping-wasm` is included in this repository, and the compiled WASM can be rebuilt from that source (e.g. via `wasm-pack`). No npm publish until v1.0.

## Process Rules — Apply to All Packages

- **TDD is mandatory** — tests written before tasks, no exceptions unless a specific workId overrides
- **Division of labour**: tests are human-authored; task drafts are LLM-generated and reviewed on exception only
- All user-facing config parameters are user-configurable — never hardcoded
- External APIs are stable within a version — internal changes must not be visible to callers

## Key Documents

- Work registry: `work-pool.md`
- Terminology: `glossary.md`
- Package decisions: `[package]-decisions.md` per package
- Package context: `[package]-inner-context.md` per package
- Active plans: `workId-package-type-plan-[datetime].md`

## Current Focus

- v0.4.0 release cycle
- workId 001: shaping result cache (font-engine + shaping-wasm) — status: planned
- Article series: "Towards an Open Source Print-Ready Publication Library in JavaScript"

## What paragraf Is Not

- Not a TeX/LuaTeX wrapper or replacement
- Not a web DOM text renderer
- Not an InDesign plugin
- Adaptors to other systems are out of scope — implementable by third parties
