# @paragraf/layout

Page geometry, unit converters, and named page sizes for the [paragraf](https://github.com/kadetr/paragraf) typesetter. Browser-safe — no rendering logic, ink, or colour handling.

## Installation

```bash
npm install @paragraf/layout
```

## Quick start

```ts
import { PageLayout, mm } from '@paragraf/layout';

const layout = new PageLayout({
  size:    'A4',
  margins: mm(20),
  columns: 2,
  gutter:  mm(5),
  bleed:   mm(3),
});

// Feed frames into layoutDocument from @paragraf/typography
const frames = layout.frames(pageCount);

// PDF box metadata
const [pageW, pageH] = layout.pageSize;  // includes bleed
const trimBox        = layout.trimBox;   // the cut line
const bleedBox       = layout.bleedBox;  // full expanded page
```

## Unit converters

All converters return **points** (pt), the native unit used throughout paragraf. 1 inch = 72 pt.

```ts
import { mm, cm, inch, px } from '@paragraf/layout';

mm(20)         // → 56.693 pt
cm(2)          // → 56.693 pt
inch(0.5)      // → 36 pt
px(100)        // → 75 pt   (96 dpi, CSS default)
px(100, 300)   // → 24 pt   (300 dpi print)
```

| Function | Formula |
|---|---|
| `mm(v)` | `v × 72 / 25.4` |
| `cm(v)` | `v × 72 / 2.54` |
| `inch(v)` | `v × 72` |
| `px(v, dpi?)` | `v × 72 / dpi` (default dpi = 96) |

## Dimension strings

Some layout helpers accept a `Dimension` value — either a raw number (already in points) or a string with a unit suffix:

```ts
import { parseDimension } from '@paragraf/layout';
import type { Dimension } from '@paragraf/layout';

parseDimension(36)        // → 36  (pass-through)
parseDimension('20mm')    // → mm(20) ≈ 56.69 pt
parseDimension('2cm')     // → cm(2)  ≈ 56.69 pt
parseDimension('0.5in')   // → 36 pt
parseDimension('36pt')    // → 36 pt
parseDimension('100px')   // → px(100) ≈ 75 pt
```

Supported suffixes: `mm`, `cm`, `in`, `pt`, `px` (case-insensitive). Throws if the string format is unrecognised.

## Named page sizes

```ts
import { PAGE_SIZES, resolvePageSize } from '@paragraf/layout';

PAGE_SIZES.A4           // [595.28, 841.89]
resolvePageSize('A4')   // [595.28, 841.89]
resolvePageSize([300, 400])  // [300, 400] — pass-through
```

Available names: `A0`, `A1`, `A2`, `A3`, `A4`, `A5`, `A6`, `B4`, `B5`, `SRA3`, `SRA4`, `Letter`, `Legal`, `Tabloid`.

## Orientation helpers

```ts
import { landscape, portrait } from '@paragraf/layout';

landscape('A4')        // [841.89, 595.28] — wider side as width
portrait('A4')         // [595.28, 841.89] — taller side as height (unchanged)
landscape([595, 842])  // [842, 595]
```

`landscape` and `portrait` also accept `[width, height]` tuples. Use them to rotate a named size before passing it to `PageLayout`:

```ts
const layout = new PageLayout({ size: landscape('A4'), margins: mm(20) });
```

## Column width helper

```ts
import { columnWidths } from '@paragraf/layout';
import type { Frame } from '@paragraf/types';

const widths = columnWidths(frame);
// Single-column frame → [frame.width]
// Two-column frame with 5mm gutter → [(frame.width - mm(5)) / 2, same]
```

`columnWidths` computes `(frame.width - (n-1) × gutter) / n` for each of the `n` columns and returns an array of equal widths.

## PageLayout API

### Constructor

```ts
new PageLayout(opts: PageLayoutOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `size` | `PageSizeName \| [number, number]` | — | Named size or `[width, height]` in points |
| `margins` | `number \| Margins` | — | Equal margin (number) or per-side object, in points |
| `columns` | `number` | `1` | Number of text columns per frame |
| `gutter` | `number` | `0` | Space between columns in points |
| `bleed` | `number` | `0` | Bleed expansion in points (all four sides) |

### Properties

| Property | Type | Description |
|---|---|---|
| `pageSize` | `[number, number]` | Page dimensions including bleed — use for PDF MediaBox |
| `trimSize` | `[number, number]` | Nominal page dimensions without bleed |
| `trimBox` | `Rect` | Cut-line rectangle within the bleed-expanded space |
| `bleedBox` | `Rect` | Full page rectangle including bleed area |

### Methods

```ts
layout.frames(pageCount: number): Frame[]
```

Returns one `Frame` per page. Each frame covers the printable area (page minus margins), positioned within the bleed-expanded coordinate space. Multi-column frames carry `columnCount` and `gutter`.

## Known limitations

### Facing pages (recto/verso)

`PageLayout` uses symmetric margins per frame — there is currently no way to declare different inner/outer margins for left (verso) and right (recto) pages. Professional book layouts commonly require this (e.g. wider inner margin for binding, wider outer for thumb tabs).

**Current workaround:** call `frames()` separately for odd and even pages with two `PageLayout` instances using mirrored `Margins` objects, then interleave the resulting `Frame` arrays by page number.

A first-class `facingPages: true` option, or a separate `FacingPageLayout` class, is planned for a future release. This limitation is tracked as a known design gap.

## Notes

This package handles **geometry only**. It does not produce ink, CMYK values, spot colours, or printer marks. Bleed expands the page size and positions frames correctly — crop marks and output intents are handled by `@paragraf/render-pdf`.

## Layer

`@paragraf/layout` is **Layer 1** in the paragraf stack. It depends only on `@paragraf/types`.

```
Layer 0   @paragraf/types
Layer 1   @paragraf/layout   ← this package
```
