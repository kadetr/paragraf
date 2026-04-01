# Step 10 — Documentation

This step produces the written documentation needed before publishing: per-package
READMEs, a pipeline getting-started guide, a document model explanation, and
input/output reference schemas. The HTML/CSS browser usage item from the original
roadmap is deferred — there is no browser-facing package yet and writing browser
integration notes before the browser support step exists would be speculative.

---

## Status

| Task | Status |
|---|---|
| D1 — README: `@paragraf/types` | ✅ done |
| D2 — README: `@paragraf/linebreak` | ✅ done |
| D3 — README: `@paragraf/font-engine` | ✅ done |
| D4 — README: `@paragraf/shaping-wasm` | ✅ done |
| D5 — README: `@paragraf/render-core` | ✅ done |
| D6 — README: `@paragraf/typography` | ✅ done |
| D7 — README: `@paragraf/render-pdf` | ✅ done |
| D8 — Getting started guide | ✅ done |
| D9 — Document model explanation | ⬜ not started |
| D10 — Input/output schemas reference | ⬜ not started |
| D11 — Update roadmap to reflect Step 10 scope | ⬜ not started |

---

## D1–D7 — README per package ✅

One README per package has been written. Each covers: purpose, install command,
key exports with inline code examples, and any platform constraints (Node-only,
browser-safe). The `@paragraf/render-pdf` README includes a full multi-package
pipeline example showing all four steps: registry → composer → layout → PDF.
The `@paragraf/typography` README documents both the flat-text and spans input
paths, the document composition functions, and the `wasmStatus()` diagnostic.

---

## D8 — Getting started guide ✅

`docs/getting-started.md` covers the full pipeline in 10 numbered sections:
font registry setup, composer creation, `compose()` call with all key options
annotated, rich text spans, `layoutParagraph`, PDF output, SVG output,
multi-paragraph `composeDocument` + `layoutDocument`, baseline grid, and
multi-language hyphenation. The guide ends with a browser compatibility matrix.

---

## D9 — Document model explanation

**File to create:** `docs/document-model.md`

This document explains the conceptual model behind multi-paragraph, multi-frame
document composition in `@paragraf/typography`. It must cover every moving part
of the two-step `composeDocument` → `layoutDocument` pipeline in enough detail
that a reader can reason about what will happen to their content without reading
source code.

The explanation must address each concept in turn:

**Frame.** A `Frame` is a rectangular text area defined by `{ x, y, width, height }`
in points. It is the unit of text flow — text enters at the top and advances
downward until the frame is full. The document's `frames` array defines the
order text flows through each area. When the first frame fills, the engine
continues into the second, opening a new page if no more frames remain on the
current page. Frames on different pages have the same coordinate space (origin
at top-left of their respective page).

**Page.** A page is not an explicit input type. It emerges from the layout pass:
each time the cursor overflows the last frame assigned to a page, a new
`RenderedPage` is created and the cursor resets to the next frame's origin. The
output type `RenderedDocument.pages` is a flat array of `RenderedPage`, each
holding `RenderedItem[]` (one item per paragraph placed on that page).

**Baseline grid.** The baseline grid is an optional vertical rhythm constraint.
When provided, each paragraph's first baseline is snapped forward to the nearest
grid line rather than placed at the exact cursor position. Grid lines are spaced
`leading` points apart starting from `frame.y`. The `capHeight` value determines
how far below a grid line the first baseline of the first line should sit, so
that capital letters optically align with the grid. The document must explain the
`snapCursorToGrid` math, what `gridAdvance` returns, and why snapping only
happens at paragraph boundaries rather than on every line.

**`composeDocument`.** Takes a `Document` (list of `ParagraphInput` plus frames
and optional `styleDefaults`) and a `ParagraphComposer`, and runs `compose()` on
each paragraph. The column width is derived from `frames[0].width`. Returns a
`ComposedDocument` — the intermediate structure that holds composed line data
before any pixel/point positions are assigned. `styleDefaults` let you set
shared fields (e.g. `alignment`, `tolerance`, `language`) once rather than
repeating them on every paragraph.

**`layoutDocument`.** Takes the `ComposedDocument`, a `Measurer`, and an
optional `BaselineGrid`, and walks through each composed paragraph line by line,
advancing a cursor through the frame sequence. Returns `RenderedDocument` with
absolute x/y coordinates per glyph run. The document should show what happens
when a paragraph is too tall for the remaining space in a frame — the whole
paragraph moves to the next frame, not just the overflowing lines.

The document should also include a minimal annotated code example for each concept
and close with a visual diagram (ASCII) showing how paragraphs, frames, pages,
and the cursor relate to each other.

---

## D10 — Input/output schemas reference

**File to create:** `docs/io-schemas.md`

This is a reference document — not a tutorial. Its purpose is to give a complete
field-by-field description of every significant input and output type across the
pipeline, so a user can look up exactly what a field does, what unit it uses,
what its default is, and what happens when it is omitted. The getting-started
guide shows how to use the pipeline; this document answers the "what does this
field actually do?" question.

**Scope.** Cover the types that a caller directly constructs or reads from the
public API surface. Internal types (e.g. `BreakpointNode`, `HyphenatedWord`) are
excluded unless they appear in a public return value a caller would inspect.

**`FontRegistry` and `FontDescriptor`.** Document `id` (the string key used in
all Font references), `face` (the PostScript or family name used internally by
fontkit/rustybuzz — must match what the font file reports), and `filePath`
(absolute or relative to the process cwd). Note that `id` is arbitrary and
user-controlled; `face` is determined by the font file.

**`Font`.** Document every field: `id`, `size` (points), `weight` (CSS numeric
scale), `style`, `stretch`, `letterSpacing` (extra inter-glyph spacing in the
same unit as `size`, applied after GSUB substitution to `glyphCount - 1` gaps),
and `variant` (triggers GSUB sups/subs feature activation and `baselineShift`
scaling in metrics).

**`ParagraphInput`.** The most important schema. Every field needs a sentence or
two: what it controls in the algorithm, its unit, its default, and any interaction
with other fields. Pay particular attention to `tolerance` (the Knuth-Plass
demerits threshold — not a pixel value), `emergencyStretch` (a safety valve, not
a first resort), `looseness` (signed integer that shifts the optimizer's target
line count), `opticalMarginAlignment` (triggers a second KP pass with narrowed
effective line widths), `widowPenalty` and `orphanPenalty` (added to demerits
for the last/first line of a paragraph alone on a page — these interact with
frame overflow), and `consecutiveHyphenLimit` (PROHIBITED penalty applied after
N consecutive hyphenated lines).

**`ParagraphOutput`.** `lines` (the `ComposedParagraph`), `lineCount` (redundant
with `lines.length` but convenient), `usedEmergency` (boolean flag indicating the
algorithm had to fall back to `emergencyStretch` to find a solution — a signal
that the column is too narrow or the tolerance too tight for this text).

**`ComposedLine`.** Explain `wordSpacing` (the inter-word stretch/shrink value
actually applied on this line, in points — positive = expanded, negative =
compressed), `ratio` (the raw Knuth-Plass adjustment ratio for this break),
`hyphenated`, `isWidow`, `direction`, and `xOffset` (the optical margin
left-indent, negative = hang into margin, zero when OMA is off).

**`Document`, `ComposedDocument`, `RenderedDocument`, `RenderedPage`, `RenderedItem`.**
Explain the three-stage representation: `Document` is the intent (what to
typeset), `ComposedDocument` is the algorithm output (line breaks decided, no
positions yet), `RenderedDocument` is the final output (absolute x/y per glyph
run, ready for a renderer). A reader should understand why the intermediate stage
exists and why they might want to inspect it.

**`BaselineGrid`.** Document `leading` and `capHeight` with their units and how
they interact with `snapCursorToGrid`. Note that `capHeight` is not the same as
`ascender` — it is the distance from the baseline to the top of a capital letter,
and it determines where on the grid interval the baseline sits.

Format: each type in its own `##` section, fields in a definition list or
annotated code block. Avoid just duplicating the TypeScript interface — every
field must have at least one sentence of prose explaining its semantics.

---

## D11 — Update roadmap to reflect actual Step 10 scope

**File to update:** `docs/roadmap.md`

The Step 10 entry in the roadmap currently lists "HTML/CSS usage notes for
browser-safe packages" as an in-scope item. This must be removed and moved into
the existing "Browser support for `@paragraf/shaping-wasm`" future-work section,
or noted separately as deferred until a dedicated browser integration step is
planned. There is no browser-facing package today. Writing browser integration
docs before the browser support work exists produces documentation with no
corresponding code, which creates maintenance debt immediately.

The Step 10 entry should also be updated to reflect what was actually scoped and
completed: READMEs for all 7 packages (D1–D7), getting-started guide (D8), and
the two remaining items (D9 document model, D10 I/O schemas). The update should
be minimal — a sentence noting the HTML/CSS item is deferred and a pointer to
the future-work section.

---

## Deferred from Step 10

**HTML/CSS usage notes for browser-safe packages.** This item requires a
concrete browser integration package or at minimum a documented integration
target (e.g. a Canvas-based renderer or a CSS layout bridge) before the notes
can be accurate. `@paragraf/linebreak` and `@paragraf/render-core` are
browser-safe today, but there is no browser-specific entry point, no bundler
configuration guide, and no worked example of using them in a browser context.
Writing this documentation now would require speculating about integration
patterns that have not been designed. Defer until browser support is scoped as
a proper step (see "Browser support for `@paragraf/shaping-wasm`" in the
roadmap future-work section).
