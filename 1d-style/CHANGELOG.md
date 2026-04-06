# Changelog

## 0.4.0 — 2026-04-06

- `defineStyles` factory with `StyleRegistry` (paragraph style inheritance, field-by-field font merging, circular dependency detection)
- `defineCharStyles` factory with `CharStyleRegistry` (flat character overrides)
- Types: `ParagraphStyleDef`, `CharStyleDef`, `ResolvedParagraphStyle`, `ResolvedCharStyle`
- `FontSpec` sourced from `@paragraf/types` v0.5.0 (re-exported for convenience); no longer defined inline
- `StyleRegistry.has(name)` — check existence without throwing
- `CharStyleRegistry.has(name)` — check existence without throwing
- Built-in defaults expanded: `stretch: 'normal'`, `variant: 'normal'` added alongside existing fields
- `mergeFont()` now merges `stretch` and `variant` fields through the inheritance chain
