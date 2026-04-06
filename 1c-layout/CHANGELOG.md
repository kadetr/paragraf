# Changelog

All notable changes to `@paragraf/layout` are documented here.

## 0.4.0 — Initial release

- `PageLayout` class: page geometry, bleed/trim box calculation, `frames()` generator
- Unit converters: `mm`, `cm`, `inch`, `px`
- Named page sizes: A3, A4, A5, A6, B4, B5, Letter, Legal, Tabloid
- `resolvePageSize` helper
- `Frame` and `BaselineGrid` promoted from `@paragraf/render-core` to `@paragraf/types`
  so that Layer 1 packages can reference them without a cross-layer dependency
