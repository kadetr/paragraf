# Document Model

This document explains the multi-paragraph, multi-frame, multi-page pipeline in
`@paragraf/typography`. After reading it you should be able to reason about where
text ends up on the page without reading source code.

---

## The two-pass pipeline

Document composition is split into two distinct phases:

```
Document  ──composeDocument()──▶  ComposedDocument  ──layoutDocument()──▶  RenderedDocument
 (intent)                           (line breaks,                             (absolute x/y,
                                     no positions)                            ready to render)
```

**Phase 1 — `composeDocument`** runs the Knuth-Plass algorithm for every
paragraph. It decides where every line breaks, how much every space stretches or
shrinks, and which words get hyphenated. It does not assign any pixel or point
positions. The output is a `ComposedDocument` — a list of paragraph objects each
holding the composed line data.

**Phase 2 — `layoutDocument`** takes the composed lines and walks them through the
frame sequence, advancing a cursor to assign absolute x/y coordinates to every
glyph run. It produces the `RenderedDocument` that a renderer (`renderToPdf`,
`renderToSvg`, `renderToCanvas`) consumes directly.

Splitting the pipeline this way makes it possible to inspect and test line-breaking
decisions in isolation, and to re-layout the same composed content into a different
frame geometry without re-running the expensive Knuth-Plass pass.

---

## Frame

A `Frame` is a rectangular text area on a specific page:

```ts
interface Frame {
  page: number;       // 0-based page index
  x: number;         // left edge in points
  y: number;         // top edge in points
  width: number;     // total frame width in points (including all columns + gutters)
  height: number;    // total frame height in points
  columnCount?: number;     // number of columns; default 1
  gutter?: number;          // inter-column spacing in points; default 0
  grid?: BaselineGrid;      // optional vertical-rhythm constraint
  paragraphSpacing?: number; // extra gap below each paragraph in points; default 0
}
```

The `frames` array in a `Document` defines the order text flows through each area.
Text enters `frames[0]`, fills it column by column, then continues into `frames[1]`,
and so on. Each frame lives on a specific `page` — frames with the same `page` value
share a page in the output.

### Multi-column frames

When `columnCount > 1`, the frame's `width` is divided into columns separated by
`gutter` points. Text fills column 0 top-to-bottom, then column 1, then column 2.
When all columns on a frame are full, flow continues to the next frame.

```
┌────────────────── frame (width=450, columnCount=2, gutter=18) ──────────────────┐
│                                                                                  │
│  col 0 (216pt)                    col 1 (216pt)                                  │
│  ┌───────────────────┐    18pt    ┌───────────────────┐                          │
│  │ line 1            │◀──────────▶│ line 7            │                          │
│  │ line 2            │            │ line 8            │                          │
│  │ ...               │            │ ...               │                          │
│  │ line 6            │            │ line 12           │                          │
│  └───────────────────┘            └───────────────────┘                          │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Page

A page is not an explicit input type — it emerges from the `page` field on each
`Frame`. All frames with `page: 0` share the first page; all frames with `page: 1`
share the second page, and so on.

`layoutDocument` groups rendered items by page and returns them in a flat
`pages: RenderedPage[]` array, one entry per page index that received content.
Each `RenderedPage` holds:

```ts
interface RenderedPage {
  pageIndex: number;
  frame: Frame;        // the first frame that initiated this page
  items: RenderedItem[];
}

interface RenderedItem {
  origin: { x: number; y: number };
  rendered: RenderedParagraph;
}
```

Each `RenderedItem` is one contiguous block of lines placed in one column of one
frame. A paragraph that splits across two columns produces two `RenderedItem`
entries (one on each column), potentially on two different `RenderedPage` entries.

---

## Cursor and paragraph flow

`layoutDocument` maintains a single `cursorY` value that advances downward through
the frame sequence. The cursor starts at `frames[0].y`.

After placing each batch of lines, the cursor advances by the total height of those
lines. After placing the **last batch of a paragraph**, `paragraphSpacing` (from the
current frame) is added to the cursor.

**Paragraph splitting across frames:** a paragraph is placed line by line. If some
lines fit in the current column and others do not, the fitting lines are placed as
one `RenderedItem` and the remaining lines continue in the next column or frame.

**Force-place:** if a single line is taller than the entire remaining column height,
it is placed anyway. This prevents an infinite loop and ensures every line reaches
output, even if it overflows the frame boundary visually.

**Overflow:** if `frameIdx` exceeds the last frame in the array, remaining lines are
silently discarded. There is no error — the caller is responsible for providing
enough frame area.

---

## Baseline grid

A `BaselineGrid` is an optional vertical-rhythm constraint attached to a `Frame`:

```ts
interface BaselineGrid {
  first: number;    // Y-offset from frame.y where the first grid line sits
  interval: number; // distance between grid lines in points
}
```

Grid lines are at positions: `frame.y + first + n * interval` for `n = 0, 1, 2, …`

When a frame has a grid, `layoutDocument` snaps the cursor before placing the first
line of each paragraph. The snap moves `cursorY` forward (never backward) so that
the first baseline of the paragraph lands on the nearest grid line at or after the
current cursor position.

**`snapCursorToGrid` math:**

```
absBaseline  = cursorY + line.baseline
n            = ceil((absBaseline - (frame.y + grid.first)) / grid.interval)
snappedAbs   = frame.y + grid.first + n * grid.interval
cursorY      = snappedAbs - line.baseline
```

Snapping only happens at paragraph boundaries (before the first line of each
paragraph), not on every line. Lines within a paragraph advance by their
`lineHeight` rounded up to the grid interval via `gridAdvance`:

```ts
gridAdvance(lineHeight, interval) = ceil(lineHeight / interval) * interval
```

This keeps all lines within a paragraph on the grid without needing to re-snap
each one individually.

**`first` vs `capHeight`:** `first` is the distance from `frame.y` to the first
grid line. It is typically set to the cap-height of the body font at the body size,
so that the top of capital letters on the first line aligns with the top of the
frame. This is a design decision — the `BaselineGrid` interface does not enforce
any relationship between `first` and font metrics.

```
  frame.y ────────────────────────────────────────────
  frame.y + first ────────────── grid line 0 (baseline of first line)
            ↕ interval
            ────────────────── grid line 1 (baseline of second line)
            ↕ interval
            ────────────────── grid line 2
```

### Attaching a grid to a frame

The baseline grid is set on the `Frame`, not passed to `layoutDocument` separately:

```ts
const frames: Frame[] = [
  {
    page: 0,
    x: 72, y: 72, width: 396, height: 648,
    grid: { first: 8.5, interval: 14 },
    //       ↑ cap-height of 11pt body font ≈ 8.5pt
    //                    ↑ 14pt leading
  }
];
```

---

## `composeDocument`

```ts
composeDocument(doc: Document, composer: ParagraphComposer): ComposedDocument
```

Runs Knuth-Plass on every paragraph in `doc.paragraphs`. Three things happen
before `composer.compose()` is called for each paragraph:

1. **`styleDefaults` merge** — `doc.styleDefaults` fields are spread into each
   paragraph. Per-paragraph fields always win: `{ ...styleDefaults, ...paragraph }`.

2. **`lineWidth` override** — the column width of `frames[0]` is computed and
   forced onto every paragraph's `lineWidth`. This ensures all paragraphs are
   composed to the correct measure regardless of what `lineWidth` the caller
   provided.

3. **Multi-frame width warning** — if the frames have different column widths,
   a `console.warn` is emitted. All paragraphs are still composed at `frames[0]`
   width. To compose paragraphs at different widths (e.g. for a layout where
   paragraphs land in different-width columns), call `deriveLineWidths()` before
   `composeDocument` to pre-assign the correct `lineWidth` to each paragraph.

`styleDefaults` is useful for avoiding repetition:

```ts
const doc: Document = {
  paragraphs: [
    { text: 'First paragraph.' },
    { text: 'Second paragraph.', firstLineIndent: 11 },
    { text: 'Third paragraph.',  firstLineIndent: 11 },
  ],
  frames: [{ page: 0, x: 72, y: 72, width: 396, height: 648 }],
  styleDefaults: {
    font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
    lineWidth: 396,
    alignment: 'justified',
    tolerance: 2,
    language: 'en-us',
  },
};
// font, lineWidth, alignment, tolerance, language will be applied to all three
// paragraphs. The second and third also get firstLineIndent: 11.
```

---

## `layoutDocument`

```ts
layoutDocument(
  composed: ComposedDocument,
  frames: Frame[],
  measurer: Measurer,
): RenderedDocument
```

Note that `layoutDocument` takes `frames` as a separate argument — not from inside
the `ComposedDocument`. This means you can re-layout the same composed content into
a completely different frame geometry (different page size, different margins,
different column count) without rerunning the composition pass.

`layoutDocument` calls `layoutParagraph` internally for each batch of lines it
places. Each call produces a `RenderedParagraph` (array of `RenderedLine`, each
line containing `PositionedSegment[]` with absolute `x`/`y` coordinates).

---

## Full annotated example

```ts
import {
  composeDocument,
  layoutDocument,
  Document,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { Frame }          from '@paragraf/render-core';

const frames: Frame[] = [
  // Page 0, single column, 9×6.5 inch live area
  { page: 0, x: 72, y: 72, width: 468, height: 648,
    grid: { first: 9, interval: 14 },
    paragraphSpacing: 0 },
  // Page 1, same geometry — text overflows here if page 0 fills
  { page: 1, x: 72, y: 72, width: 468, height: 648,
    grid: { first: 9, interval: 14 },
    paragraphSpacing: 0 },
];

const doc: Document = {
  paragraphs: [
    { text: 'First paragraph text.' },
    { text: 'Second paragraph text.', firstLineIndent: 12 },
  ],
  frames,
  styleDefaults: {
    font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
    lineWidth: 468,
    alignment: 'justified',
    tolerance: 2,
    language: 'en-us',
  },
};

const composer  = await createParagraphComposer(registry);
const measurer  = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

const composed     = composeDocument(doc, composer);
const renderedDoc  = layoutDocument(composed, frames, measurer);

// renderedDoc.pages[0].items  ← all rendered items on page 0
// renderedDoc.pages[1].items  ← items that overflowed to page 1 (if any)

const pdfBuffer = await renderDocumentToPdf(renderedDoc, fontEngine);
```

---

## Conceptual diagram

```
Document.paragraphs                Document.frames
  ┌──────────────┐                   ┌────────────────────────────┐
  │  paragraph 0 │                   │ frame 0  (page 0, col×1)   │
  │  paragraph 1 │   composeDocument │ frame 1  (page 0, col×2)   │
  │  paragraph 2 │ ──────────────▶   │ frame 2  (page 1, col×1)   │
  │     ...      │                   └────────────────────────────┘
  └──────────────┘
           │
           ▼  ComposedDocument
  ┌──────────────────────────┐
  │  p0: ComposedParagraph   │   (line breaks decided, no positions)
  │  p1: ComposedParagraph   │
  │  p2: ComposedParagraph   │
  └──────────────────────────┘
           │
           │  layoutDocument(composed, frames, measurer)
           │
           ▼  RenderedDocument
  ┌──────────────────────────────────────────────────────────────┐
  │  pages[0]                                                    │
  │    items[0]  origin={72,80}  rendered=p0 lines 1–6  (frame0) │
  │    items[1]  origin={72,72}  rendered=p1 lines 1–4  (frame0) │
  │    items[2]  origin={306,72} rendered=p1 lines 5–9  (frame1) │
  │  pages[1]                                                    │
  │    items[0]  origin={72,80}  rendered=p2 lines 1–8  (frame2) │
  └──────────────────────────────────────────────────────────────┘
```

Each `RenderedItem` is one contiguous block of lines in one column. A paragraph
that crosses a column boundary becomes multiple items, potentially on multiple pages.
