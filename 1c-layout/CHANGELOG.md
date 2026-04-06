# Changelog

All notable changes to `@paragraf/layout` are documented here.

## 0.5.0 — 2026-04-06

### Added
- `landscape(size)` / `portrait(size)` orientation helpers — accept a named `PageSizeName` or an `[width, height]` tuple
- `columnWidths(frame)` — computes equal column widths accounting for gutter
- Named page sizes expanded: `A0`, `A1`, `A2`, `SRA3`, `SRA4` added to `PAGE_SIZES`
- `Dimension` type — `number | string`; string form accepts `'20mm'`, `'2cm'`, `'0.5in'`, `'36pt'`, `'100px'`
- `parseDimension(d)` — resolves a `Dimension` value to points; throws on unrecognised format

## 0.4.0 — Initial release

- `PageLayout` class: page geometry, bleed/trim box calculation, `frames()` generator
- Unit converters: `mm`, `cm`, `inch`, `px`
- Named page sizes: A3, A4, A5, A6, B4, B5, Letter, Legal, Tabloid
- `resolvePageSize` helper
- `Frame` and `BaselineGrid` promoted from `@paragraf/render-core` to `@paragraf/types`
  so that Layer 1 packages can reference them without a cross-layer dependency
