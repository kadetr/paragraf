# Changelog

All notable changes to `@paragraf/template` are documented here.

## 0.1.0 — 2026-04-06 — Initial release

- `defineTemplate(input)` — validates a template object and returns it unchanged; throws with a descriptive message on any violation
- `parseTokens(text)` — parses a content slot's text string into `Token[]` (literal + binding tokens); public API for use by `@paragraf/compile`
- Types: `Template`, `TemplateLayout`, `DimensionMargins`, `TemplateFonts`, `TemplateFontVariants`, `ContentSlot`, `OnMissing`, `Token`
- `TemplateLayout.margins` accepts `Dimension` strings (`'20mm'`, `'1in'`, etc.) — resolved to points by `@paragraf/compile` via `parseDimension()`
- `TemplateFonts` supports the four standard variant keys (`regular`, `bold`, `italic`, `boldItalic`) plus open index for custom variants (`light`, `semiBold`, etc.)
- Validation checks: style inheritance chains (cycles, missing refs), content slot style references, `onMissing: 'fallback'` ↔ `fallbackText` invariant, `{{...}}` interpolation syntax
