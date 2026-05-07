# Input / Output Schemas

Field-by-field reference for every public type in the pipeline. For a
narrative walkthrough, see the [getting started guide](./getting-started.md).
For the document model concepts (frames, pages, baseline grid), see
[document-model.md](./document-model.md).

---

## `FontDescriptor`

One entry in a `FontRegistry`. Describes a single font file.

```ts
interface FontDescriptor {
  id: string;
  face: string;
  filePath: string;
}
```

**`id`** — Arbitrary string key chosen by the caller. It is the handle used
everywhere in the pipeline: `Font.id`, `engine.glyphsForString(id, …)`,
`engine.getFontMetrics(id, …)`. Two descriptors must not share the same `id`.

**`face`** — The PostScript name or family name that the font engine uses when
it needs to match glyphs by name (e.g. for ligature feature activation in
rustybuzz). Must match what the font file reports internally. For most TTF/OTF
files this is the PostScript name found in the `name` table, e.g. `SourceSerif4`
not `Source Serif 4`. Incorrect values produce wrong glyph substitutions or
missing glyphs, not an error.

**`filePath`** — Path to the font file. Resolved relative to the Node.js process
working directory (`process.cwd()`). Absolute paths are safe and recommended.
Only `.ttf` and `.otf` are supported.

---

## `FontRegistry`

```ts
type FontRegistry = Map<FontId, FontDescriptor>;
```

A plain `Map` from `id` string to `FontDescriptor`. Passed to
`createParagraphComposer`, `createDefaultFontEngine`, and `createMeasurer`.
All three functions load fonts eagerly from this map on construction — adding
entries after construction has no effect.

---

## `Font`

Describes a text run at a specific size and style. Passed on every `Box` node,
every `TextSpan`, and every `ParagraphInput.font`.

```ts
interface Font {
  id: string;
  size: number;
  weight: number;
  style: FontStyle;
  stretch: FontStretch;
  letterSpacing?: number;
  variant?: FontVariant;
}
```

**`id`** — Must match a key in the `FontRegistry`. The engine uses this to look
up the corresponding font file. An unknown `id` at render time throws.

**`size`** — Font size in points. All metrics, widths, and positions derived from
this font are scaled to this size. There is no separate concept of "em size" in
the public API — everything is in points.

**`weight`** — CSS numeric weight scale: 100 (thin) to 900 (black). `400` =
regular, `700` = bold. The pipeline does not currently select a font file by
weight — the caller is responsible for mapping weights to the correct `id`.

**`style`** — `'normal'` | `'italic'` | `'oblique'`. Informational only at the
current stage — the pipeline does not synthesize italic glyphs.

**`stretch`** — `'condensed'` | `'semi-condensed'` | `'normal'` | `'semi-expanded'`
| `'expanded'`. Informational only at the current stage.

**`letterSpacing`** — Extra gap inserted between glyphs after GSUB substitution,
in the same unit as `size` (points). Applied to `glyphCount - 1` gaps within each
text run. `0` or `undefined` = no extra spacing (default). Positive = expanded
tracking, negative = tight tracking. Unlike word spacing, letter spacing is applied
uniformly regardless of justification.

**`variant`** — `'normal'` | `'superscript'` | `'subscript'`. When set to
`'superscript'` or `'subscript'`, the engine activates the GSUB `sups`/`subs`
feature for glyph substitution and scales the `baselineShift` in `FontMetrics`
accordingly. The visual shift is applied at layout time.

---

## `TextSpan`

A single-font text run for rich-text paragraph input. Used when `ParagraphInput.spans`
is provided instead of `text`.

```ts
interface TextSpan {
  text: string;
  font: Font;
  verticalOffset?: number;
}
```

**`text`** — The raw text content of this run. May contain spaces; word
boundaries are detected across the full span sequence, not per-span. A span
boundary mid-word is valid.

**`font`** — The font applied to every character in this run.

**`verticalOffset`** — Vertical shift in points applied at render time.
Positive = raised above baseline (superscript-style shift). Negative = lowered
below baseline (subscript-style shift). This is a render-level offset, not a
GSUB feature activation — for proper glyph substitution use `Font.variant`
instead, or combine both.

---

## `ParagraphInput`

The primary input to `composer.compose()`. Every field except `font` and
`lineWidth` is optional.

```ts
interface ParagraphInput {
  text?: string;
  spans?: TextSpan[];
  font: Font;
  fontPerWord?: (index: number, word: string) => Font;

  lineWidth: number;
  lineWidths?: number[];
  tolerance?: number;
  emergencyStretch?: number;
  firstLineIndent?: number;
  alignment?: AlignmentMode;
  language?: Language;
  looseness?: number;
  justifyLastLine?: boolean;
  consecutiveHyphenLimit?: number;
  runtPenalty?: number;
  singleLinePenalty?: number;
  preserveSoftHyphens?: boolean;
  opticalMarginAlignment?: boolean;
}
```

**`text`** — Plain text input. Mutually exclusive with `spans`. The entire
paragraph uses `font`.

**`spans`** — Rich text input. An array of `TextSpan` objects. Mutually
exclusive with `text`. `font` is still required and is used as the spacing
reference for glue nodes (word spacing metrics are derived from it).

**`font`** — Required. For plain-text paragraphs, this is the font for all
glyphs. For span paragraphs, this is the spacing-reference font. In both cases
it drives the default word-space width, stretch, and shrink.

**`fontPerWord`** — Advanced. A callback called for each word (by 0-based index
and word string) to return a per-word `Font`. Ignored when `spans` is provided.
Useful for bidirectional text or mixed-script paragraphs where font selection
depends on content.

**`lineWidth`** — The measure of the text column in points. Overridden by
`composeDocument` to match the column width of the first frame. When calling
`composer.compose()` directly (outside a document), this must be set correctly.

**`lineWidths`** — Per-line widths in points. Overrides `lineWidth` for the
corresponding line index. Useful for shaped columns (e.g. runaround — text that
flows around an image by having shorter lines adjacent to it). Lines beyond
`lineWidths.length` use `lineWidth`.

**`tolerance`** — The Knuth-Plass badness threshold. This is not a pixel value
— it is a dimensionless demerits ceiling. Lower values (`1`) require tightly-fit
lines and may produce unsolvable paragraphs (falling back to `emergencyStretch`).
Higher values (`10`) allow more loosely-spaced lines. Default `2` is the
Knuth-Plass canonical recommendation. Practically: `1–2` = tight/book quality,
`3–4` = acceptable screen readability, `>5` = noticeably loose.

**`emergencyStretch`** — Extra stretch budget (in points) activated when the
algorithm cannot find a valid breakpoint sequence within `tolerance`. It is a
safety valve — a paragraph that only breaks cleanly with `emergencyStretch`
active is a signal that either the column is too narrow, the tolerance too tight,
or the text too long for the available space. When used, `ParagraphOutput.usedEmergency`
is set to `true`. Default `0` (disabled).

**`firstLineIndent`** — Indentation of the first line in points. A standard
paragraph indent is typically `1em` = the body font size in points. Default `0`.

**`alignment`** — `'justified'` | `'left'` | `'right'` | `'center'`. Controls
how space is distributed across each line. `'justified'` distributes excess space
proportionally across word gaps. `'left'` / `'right'` / `'center'` leave the
remaining space at the right, left, or both edges respectively. Default
`'justified'`.

**`language`** — BCP 47 language tag controlling which Knuth-Liang hyphenation
dictionary is loaded. Hyphenation is applied during node construction; the
dictionary for the requested language must have been loaded via
`composer.ensureLanguage(language)` before the first `compose()` call with that
language. `'en-us'` is always pre-loaded. Default `'en-us'`.

**`looseness`** — A signed integer that shifts the optimizer's target line count
relative to the optimum. `0` = fewest lines that meet tolerance (default).
`+1` = target one more line than optimum (looser spacing). `-1` = one fewer line
(tighter spacing). Values outside `[-2, +2]` are unusual in practice.

**`justifyLastLine`** — When `true`, the last line of a justified paragraph is
also justified (stretched to fill the line width). Default `false` — the last
line is set ragged-right.

**`consecutiveHyphenLimit`** — Maximum number of consecutive hyphenated lines
allowed. After this many consecutive hyphens, a `PROHIBITED` penalty is inserted
to forbid another hyphen on the next line. `0` or `undefined` = no limit. Value
`1` means at most one hyphenated line before a non-hyphenated line is required.

**`runtPenalty`** — Extra demerits added when the last line of a paragraph
contains a single word (runt line). Higher values discourage runt lines;
they produce longer paragraphs or slightly worse spacing to avoid the runt.
Default `0` (disabled). Typical values: `1000`–`10000`.

**`singleLinePenalty`** — Extra demerits added when the entire paragraph fits on a
single line (i.e. the KP solver produces no intermediate line breaks). This is a
per-paragraph demerit applied at composition time, independent of paging or frame
layout. Higher values encourage the solver to break the paragraph across multiple
lines instead. Default `0` (disabled). Typical values: `1000`–`10000`.

**`preserveSoftHyphens`** — When `true`, soft hyphen characters (`U+00AD`) in the
input text are preserved as explicit hyphenation points. When `false` (default),
soft hyphens are stripped. Most callers leave this `false` and rely on the
automatic Knuth-Liang hyphenation dictionary.

**`opticalMarginAlignment`** — When `true`, runs a second Knuth-Plass pass with
the effective line widths slightly narrowed to reserve margin space for
punctuation and thin letters. The result is that hanging punctuation (leading
quotation marks, hyphens, commas, periods) and thin letters at the left edge of a
line protrude slightly into the margin, producing optically straighter left
margins. Each output `ComposedLine.xOffset` is set to the margin protrusion in
points (negative = hang into the left margin). Default `false`.

---

## `ParagraphOutput`

Return value of `composer.compose()`.

```ts
interface ParagraphOutput {
  lines: ComposedParagraph;
  lineCount: number;
  usedEmergency: boolean;
}
```

**`lines`** — The `ComposedParagraph` (`ComposedLine[]`). This is the input to
`layoutParagraph` and the content stored inside `ComposedDocument`.

**`lineCount`** — The number of lines in `lines`. Equivalent to `lines.length`.
Provided as a convenience since checking `lines.length` requires knowing the type.

**`usedEmergency`** — `true` if the `emergencyStretch` fallback was activated to
find a valid breakpoint sequence. A `true` value is a design signal: the column
or tolerance settings do not suit this text. Consider widening the column,
increasing `tolerance`, or shortening the text.

---

## `ComposedLine`

One line in a `ComposedParagraph`. Produced by the Knuth-Plass algorithm;
consumed by `layoutParagraph`.

```ts
interface ComposedLine {
  words: string[];
  fonts: Font[];
  wordRuns: SpanSegment[][];
  wordSpacing: number;
  hyphenated: boolean;
  ratio: number;
  alignment: AlignmentMode;
  isWidow: boolean;
  lineWidth: number;
  lineHeight: number;
  baseline: number;
  direction?: 'ltr' | 'rtl';
  xOffset?: number;
}
```

**`words`** — The text content of each word on the line. For a hyphenated last
word, the trailing entry includes the hyphen character.

**`fonts`** — The font corresponding to each entry in `words` (parallel array).
For plain-text paragraphs all entries are the same font; for span paragraphs
each word may have a different font.

**`wordRuns`** — Per-word span detail. `wordRuns[i]` is an array of `SpanSegment`
objects covering the characters of `words[i]`. Used by the renderer to handle
words that span a font boundary (e.g. a word that starts in regular and ends in
bold because a span boundary falls mid-word).

**`wordSpacing`** — The total resolved inter-word spacing for this line,
in points. This is the final value placed between words — not an adjustment
added on top of some base. Positive = expanded (line is loose). Negative =
compressed (line is tight). Computed as: natural word space width + ratio ×
stretch (or shrink). For non-justified lines (`'left'`, `'right'`, `'center'`),
`wordSpacing` equals the natural word space width.

**`hyphenated`** — `true` if this line ends with an automatic or explicit hyphen.

**`ratio`** — The raw Knuth-Plass adjustment ratio for this breakpoint. `0` =
exactly the natural width. Positive = stretched beyond natural. Negative =
compressed below natural. Values near `±1` are borderline; values beyond `±1`
indicate the algorithm was struggling. Most callers do not read this field.

**`alignment`** — The alignment mode applied to this line, propagated from
`ParagraphInput.alignment`. `layoutParagraph` reads this field to compute the
horizontal start position of the line: `right`-aligned lines are shifted by
`lineWidth − contentWidth`; `center`-aligned lines by half that amount. This
offset is computed internally by the renderer and is independent of `xOffset`.

**`isWidow`** — `true` if this is the last line of the paragraph and it
contains only one non-empty content word. This is a compositional fact set
during the Knuth-Plass pass — it reflects the structure of the line itself,
not whether it overflowed a frame. For display/diagnostic purposes only.

**`lineWidth`** — The actual column width used for this line. May differ from
`ParagraphInput.lineWidth` if `lineWidths` was provided.

**`lineHeight`** — The vertical space this line occupies in points. Derived from
the maximum `ascender - descender + lineGap` across all fonts appearing on the
line. This is the value `layoutDocument` adds to the cursor after placing the line.

**`baseline`** — The distance from the top of the line's bounding box to the
baseline, in points. `layoutParagraph` uses this to compute the absolute Y of the
baseline on the page: `origin.y + cumulative lineHeight + baseline`.

**`direction`** — `'ltr'` or `'rtl'`. Propagated from the paragraph's detected
text direction. `undefined` is treated as `'ltr'` by the renderer.

**`xOffset`** — Left-margin shift in points for optical margin alignment. Negative
means the line starts slightly to the left of the frame's left edge (hanging into
the margin). `0` or `undefined` when OMA is disabled.

---

## `RenderedParagraph`, `RenderedLine`, `PositionedSegment`

Output of `layoutParagraph`. The input to all renderers.

```ts
type RenderedParagraph = RenderedLine[];

interface RenderedLine {
  segments: PositionedSegment[];
  baseline: number;
  lineHeight: number;
}

interface PositionedSegment {
  text: string;
  font: Font;
  x: number;
  y: number;
}
```

**`RenderedLine.segments`** — All text runs on the line, each with absolute page
coordinates. A line that mixes two fonts produces two segments.

**`RenderedLine.baseline`** — Absolute Y coordinate of the baseline in points,
measured from the page origin (top-left). Used by PDF and SVG renderers to
position glyphs.

**`RenderedLine.lineHeight`** — Same value as `ComposedLine.lineHeight` for the
corresponding line. Carried through for renderers that need to compute bounding
boxes.

**`PositionedSegment.x`** — Absolute X of the start of this text run in points.

**`PositionedSegment.y`** — Absolute Y of the baseline for this run, adjusted for
`verticalOffset` from the source `TextSpan`. For normal text this equals
`RenderedLine.baseline`. For superscripts it is less (raised); for subscripts
it is greater (lowered).

---

## `Document`

Input to `composeDocument`.

```ts
interface Document {
  paragraphs: ParagraphInput[];
  frames: Frame[];
  styleDefaults?: Partial<ParagraphInput>;
}
```

**`paragraphs`** — The paragraphs to typeset, in order. Each is a full
`ParagraphInput`; fields not specified here fall back to `styleDefaults`.

**`frames`** — The text areas text flows through. Must contain at least one
frame. See [document-model.md](./document-model.md) for frame semantics.

**`styleDefaults`** — A partial `ParagraphInput` applied as a base to every
paragraph. Per-paragraph fields always override. Used to avoid repeating `font`,
`alignment`, `tolerance`, `language`, etc. on every paragraph.

---

## `ComposedDocument`

Intermediate output of `composeDocument`; input to `layoutDocument`.

```ts
interface ComposedDocument {
  paragraphs: Array<{ input: ParagraphInput; output: ParagraphOutput }>;
}
```

Each entry pairs the original `ParagraphInput` (pre-`styleDefaults` merge,
pre-`lineWidth` override — i.e. exactly what the caller provided) with the
`ParagraphOutput` from the Knuth-Plass pass. Callers can inspect
`output.usedEmergency`, `output.lineCount`, and `output.lines` before proceeding
to layout.

---

## `RenderedDocument`, `RenderedPage`, `RenderedItem`

Output of `layoutDocument`. See also [document-model.md](./document-model.md).

```ts
interface RenderedDocument {
  pages: RenderedPage[];
}

interface RenderedPage {
  pageIndex: number;
  frame: Frame;
  items: RenderedItem[];
}

interface RenderedItem {
  origin: { x: number; y: number };
  rendered: RenderedParagraph;
}
```

**`RenderedDocument.pages`** — One entry per page index that received at least
one line of content. Pages with no content are not present. The array is sorted
by `pageIndex` ascending.

**`RenderedPage.pageIndex`** — 0-based index matching `Frame.page`.

**`RenderedPage.frame`** — The first frame that contributed to this page
(the frame with `frame.page === pageIndex`). Useful for knowing the page
dimensions and margins when constructing a PDF page.

**`RenderedPage.items`** — All rendered paragraph batches on this page, in the
order they were placed. Each item is one contiguous block of lines from one
paragraph in one column.

**`RenderedItem.origin`** — Absolute `{x, y}` in points of the top-left corner
of this text block on the page.

**`RenderedItem.rendered`** — The `RenderedParagraph` for this block. Each
`RenderedLine` inside it has absolute coordinates already incorporating `origin`.

---

## `Frame` and `BaselineGrid`

See [document-model.md](./document-model.md#frame) for field semantics.
Defined in `@paragraf/render-core`, re-exported from `@paragraf/typography`.

```ts
interface Frame {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  columnCount?: number;    // default 1
  gutter?: number;         // default 0
  grid?: BaselineGrid;
  paragraphSpacing?: number; // default 0
}

interface BaselineGrid {
  first: number;    // offset from frame.y to first grid line
  interval: number; // distance between grid lines in points
}
```

---

## `PdfOptions` and `DocumentPdfOptions`

Options for `renderToPdf` and `renderDocumentToPdf` in `@paragraf/render-pdf`.

```ts
interface PdfOptions {
  width?: number;   // default 595.28 (A4)
  height?: number;  // default 841.89 (A4)
  fill?: string;    // default 'black'
}

interface DocumentPdfOptions {
  pageWidth?: number;   // default 595.28
  pageHeight?: number;  // default 841.89
  fill?: string;        // default 'black'
}
```

**`width` / `height` / `pageWidth` / `pageHeight`** — PDF page size in points.
The default is A4 (595.28 × 841.89 pt). For US Letter use `612 × 792`. These
values must match the coordinate space used in `Frame` definitions — the frame
coordinates are not transformed; they are written directly into the PDF.

**`fill`** — CSS colour string for all glyph fills. Applied as a single fill
colour for the entire render call. Default `'black'`. Per-glyph colour is not
yet supported at the PDF render level.

---

## Per-Package I/O

One-line signature for every primary function in the pipeline.

### `1a` — `@paragraf/linebreak`

| Input | Function | Output |
|---|---|---|
| `string[], Font[], Measurer, opts` | `buildNodeSequence` | `Node[]` |
| `Node[], lineWidth, opts` | `computeBreakpoints` | `BreakpointResult` |
| `Node[], LineBreak[], alignment, opts` | `composeParagraph` | `ComposedParagraph` |

The three functions compose: build nodes → find breakpoints → assemble lines.
The higher-level entry point in `3a` wraps all three.

### `1b` — `@paragraf/font-engine`

| Input | Function | Output |
|---|---|---|
| `FontRegistry` | `createMeasurer(registry)` | `Measurer` |
| `string, string` | `new FontkitEngine()` then `.loadFont(id, filePath)` | `FontEngine` |

`createMeasurer` wraps the engine so the algorithm layer can measure word widths
without knowing about font files. `FontkitEngine` is the underlying shaping
adapter.

### `2a` — `@paragraf/shaping-wasm`

| Input | Function | Output |
|---|---|---|
| `(none)` | `loadShapingWasm()` | raw WASM module |
| `Font[], wasm` | `new WasmFontEngine(fonts, wasm)` | `FontEngine` |
| `Node[]` | `serializeNodesToBinary(nodes)` | `Uint8Array` |
| `Uint8Array, lineWidth, opts` | `tracebackWasmBinary(binary, ...)` | `ComposedParagraph` |

Drop-in `FontEngine` replacement that shapes glyphs in Rust. The binary
serialize/traceback path offloads the full KP solve to WASM.

### `2b` — `@paragraf/render-core`

| Input | Function | Output |
|---|---|---|
| `ComposedParagraph, Measurer, origin` | `layoutParagraph` | `RenderedParagraph` |
| `RenderedParagraph, FontEngine, viewport` | `renderToSvg` | `string` (SVG markup) |
| `RenderedParagraph, FontEngine, ctx` | `renderToCanvas` | `void` |

`layoutParagraph` resolves composed lines to absolute page coordinates.
`renderToSvg` / `renderToCanvas` consume those coordinates to produce output.

### `3a` — `@paragraf/typography`

| Input | Function | Output |
|---|---|---|
| `FontRegistry, ComposerOptions?` | `createParagraphComposer` | `ParagraphComposer` |
| `ParagraphInput` | `composer.compose` | `ParagraphOutput` |
| `Document, ParagraphComposer` | `composeDocument` | `ComposedDocument` |
| `ComposedDocument, Frame[], Measurer` | `layoutDocument` | `RenderedDocument` |
| `FontRegistry` | `createDefaultFontEngine` | `FontEngine` |

`3a` is the standard entry point for the full pipeline. It wraps `1a` and
delegates rendering to `2b`. For single-paragraph use: `compose` → `layoutParagraph`.
For multi-frame documents: `composeDocument` → `layoutDocument`.

### `3b` — `@paragraf/render-pdf`

| Input | Function | Output |
|---|---|---|
| `RenderedParagraph, FontEngine, PdfOptions?` | `renderToPdf` | `Promise<Buffer>` |
| `RenderedDocument, FontEngine, DocumentPdfOptions?` | `renderDocumentToPdf` | `Promise<Buffer>` |

Consumes layout output from `2b` (`layoutParagraph`) or `3a` (`layoutDocument`)
and produces a PDF `Buffer` ready for `fs.writeFileSync`.

---

### Full pipeline at a glance

```
FontRegistry
  │
  ├─▶ 1b  createMeasurer           ──▶  Measurer
  │                                        │
  └─▶ 3a  createParagraphComposer  ──▶  ParagraphComposer
                │
                ▼
          ParagraphInput
                │
                ▼ composer.compose
          ParagraphOutput (ComposedParagraph)
                │
                ├─ single paragraph ──▶  2b  layoutParagraph  ──▶  RenderedParagraph
                │                                                        │
                │                             ┌──────────────────────────┤
                │                             │                          │
                │                    2b renderToSvg            3b renderToPdf
                │                    string (SVG)              Promise<Buffer>
                │
                └─ document ──▶  3a  composeDocument  ──▶  ComposedDocument
                                           │
                                           ▼  layoutDocument
                                     RenderedDocument
                                           │
                                  3b  renderDocumentToPdf
                                     Promise<Buffer>
```
