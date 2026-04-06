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

## Named page sizes

```ts
import { PAGE_SIZES, resolvePageSize } from '@paragraf/layout';

PAGE_SIZES.A4           // [595.28, 841.89]
resolvePageSize('A4')   // [595.28, 841.89]
resolvePageSize([300, 400])  // [300, 400] — pass-through
```

Available names: `A3`, `A4`, `A5`, `A6`, `B4`, `B5`, `Letter`, `Legal`, `Tabloid`.

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

## Notes

This package handles **geometry only**. It does not produce ink, CMYK values, spot colours, or printer marks. Bleed expands the page size and positions frames correctly — crop marks and output intents are handled by `@paragraf/render-pdf`.

## Layer

`@paragraf/layout` is **Layer 1** in the paragraf stack. It depends only on `@paragraf/types`.

```
Layer 0   @paragraf/types
Layer 1   @paragraf/layout   ← this package
```
