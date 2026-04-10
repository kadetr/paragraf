# Changelog

All notable changes to `@paragraf/types` are documented here.

## 0.5.0 — 2026-04-06

### Added
- `FontWeight` type: `number | 'thin' | 'extra-light' | 'light' | 'normal' | 'medium' | 'semi-bold' | 'bold' | 'extra-bold' | 'black'` — authoring-only; named keywords map to 100–900 via `resolveWeight()`
- `resolveWeight(w: FontWeight): number` — first runtime export in this package; needed by both `@paragraf/style` and the forthcoming `@paragraf/compile` independently
- `FontSpec` interface (moved here from `@paragraf/style` so `@paragraf/template` can import it without depending on the full style package):
  - `family?`, `size?`, `style?`, `stretch?`, `letterSpacing?` — unchanged from previous location
  - `weight?: FontWeight` — was `number`, now accepts named keywords
  - `variant?: FontVariant` — new; was present on `Font` but absent from `FontSpec`
- `FontDescriptor.family` — renamed from `FontDescriptor.face` (face = single typeface variant; family = the group; the field stored the family name)
- `FontDescriptor.weight?`, `FontDescriptor.style?`, `FontDescriptor.stretch?` — optional variant metadata enabling compile-layer `family + variant → FontId` resolution without opaque string IDs

### Breaking changes
- `FontDescriptor.face` removed — renamed to `FontDescriptor.family`. Update all `{ id, face, filePath }` literals to `{ id, family, filePath }`.

## 0.4.0 — 2026-04-02

> Note: `@paragraf/types` 0.4.0 shipped inline with `@paragraf/layout` 0.4.0 and `@paragraf/style` 0.4.0 — no standalone release was cut. The additions below were present in those package releases.

### Added
- `Frame` interface — rectangular text region with `page`, `x`, `y`, `width`, `height`, `columnCount?`, `gutter?`, `grid?`, `paragraphSpacing?`
- `BaselineGrid` interface — `{ first, interval }` for baseline-snap line placement
- Both promoted from `@paragraf/render-core` to Layer 0 so `@paragraf/layout` (Layer 1) can reference them without a cross-layer dependency

## 0.3.0 — 2026-04-02

Initial public release.
