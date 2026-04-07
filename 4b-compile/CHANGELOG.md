# Changelog — @paragraf/compile

All notable changes to this package will be documented in this file.

## [0.5.0] — 2026-01-01

### Added

- `compile()` — 10-step single-document compilation pipeline:
  1. Build `FontRegistry` from `TemplateFonts` with 18-key convention table
  2. Create `ParagraphComposer` + `FontEngine` with WASM auto-detect
  3. Construct `PageLayout` from `TemplateLayout` (Dimension resolution)
  4. Build `StyleRegistry` from `Template.styles` via `defineStyles()`
  5. Apply optional `normalize()` to reshape raw data
  6. Resolve content slot bindings with `parseTokens` and dot-path traversal
  7. Map resolved slots to `ParagraphInput` via `StyleRegistry.resolve()`
  8. Pre-load required languages via `ParagraphComposer.ensureLanguage()`
  9. `composeDocument()` + `layoutDocument()` with overflow line counting
  10. Render to PDF (`renderDocumentToPdf`), SVG (`renderToSvg` per item), or `RenderedDocument`
- `compileBatch()` — concurrent multi-record compilation with in-process semaphore and collect-errors mode
- `buildFontRegistry()` — convert `TemplateFonts` to `FontRegistry`
- `resolveVariantEntry()` — expand a `FontVariantEntry` to full metadata using convention table
- `selectVariant()` — CSS nearest-weight font variant selection
- `VARIANT_CONVENTIONS` — 18-key weight/style convention table (thin → black, and italic variants)
- `resolveText()` — dot-path binding resolver for interpolated slot text
- Full TypeScript types: `CompileOptions`, `CompileResult`, `CompileBatchOptions`, `CompileBatchResult`, `OutputFormat`, `OverflowBehavior`, `ShapingMode`
- 62 tests (27 unit, 35 integration)
