# Changelog

All notable changes to `@paragraf/template` are documented here.

## 0.5.0 — 2026-04-06

- **feat:** validate `TemplateLayout` Dimension strings (`margins`, `gutter`, `bleed`) eagerly in `defineTemplate()` using `parseDimension()` — invalid strings (e.g. `'20badunit'`) now throw at define-time with a `layout: …` prefix message instead of silently passing through to `@paragraf/compile`
- **fix:** `defineTemplate()` now throws when a content slot has `fallbackText` set without `onMissing: 'fallback'` (the value would otherwise be silently ignored by the compile layer)
- **fix:** `defineTemplate()` now throws when a content slot's `text` is an empty string
- **docs:** README layer diagram notes that Layers 2 and 3 are not required by this package
- **chore:** add `tsup.config.ts` (build was previously broken)
- **chore:** add `LICENSE` file
- Versioned at `0.5.0` to align with the Layer 1 peer packages (`@paragraf/layout`, `@paragraf/style`)

## 0.1.0 — 2026-04-06 — Initial release

- `defineTemplate(input)` — validates a template object and returns it unchanged; throws with a descriptive message on any violation
- `parseTokens(text)` — parses a content slot's text string into `Token[]` (literal + binding tokens); public API for use by `@paragraf/compile`
- Types: `Template`, `TemplateLayout`, `DimensionMargins`, `TemplateFonts`, `TemplateFontVariants`, `ContentSlot`, `OnMissing`, `Token`
- `TemplateLayout.margins` accepts `Dimension` strings (`'20mm'`, `'1in'`, etc.) — resolved to points by `@paragraf/compile` via `parseDimension()`
- `TemplateFonts` supports the four standard variant keys (`regular`, `bold`, `italic`, `boldItalic`) plus open index for custom variants (`light`, `semiBold`, etc.)
- Validation checks: style inheritance chains (cycles, missing refs), content slot style references, `onMissing: 'fallback'` ↔ `fallbackText` invariant, `{{...}}` interpolation syntax
