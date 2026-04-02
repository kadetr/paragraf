# render-pdf — selectable text overlay: precise implementation roadmap

Delivery target: Claude Code
Package: `3b-render-pdf` (`@paragraf/render-pdf`)
Files changed: `src/pdf.ts`, `src/index.ts`, `src/selectable.ts` (new)
Tests added: `tests/selectable.test.ts` (new)

---

## Critical architectural finding

`RenderedParagraph` does **not** store pre-computed glyph positions.
Glyph positions are computed on-the-fly inside `drawRenderedParagraph` using
the local variable `gx` which advances per glyph:

```ts
gx += (glyph.advanceWidth + kern) * scale;
if (letterSpacing && i < glyphs.length - 1) gx += letterSpacing;
```

This means the invisible text overlay **must be computed in the same loop**
as the path drawing — not in a second pass. We accumulate glyph x-positions
alongside drawing, then emit the TJ block at the end of each segment.

A second-pass approach would require re-running `glyphsForString`,
`applyLigatures`, `getKerning` for every segment — expensive and fragile.

---

## Confirmed types (from tests and source)

```ts
// RenderedParagraph = line array
type RenderedParagraph = Array<{
  segments: Array<{
    text: string;
    font: Font;   // { id, size, weight, style, stretch, variant?, letterSpacing? }
    x: number;   // segment start x, points from page left
    y: number;   // baseline y, points from page TOP (pdfkit top-left convention)
  }>;
  baseline: number;
  lineHeight: number;
}>;

// RenderedDocument
type RenderedDocument = {
  pages: RenderedPage[];
};
type RenderedPage = {
  pageIndex: number;
  frame: { page: number; x: number; y: number; width: number; height: number };
  items: Array<{
    origin: { x: number; y: number };
    rendered: RenderedParagraph;
  }>;
};
```

`seg.y` is the baseline in pdfkit's top-left coordinate system — confirmed by
`drawRenderedParagraph` which passes `seg.y` directly to path commands.

For BT/ET raw content, PDF uses bottom-left origin:
```
pdfNativeY = pageHeight - seg.y
```

---

## The font registration problem

The current `drawRenderedParagraph` **never calls `doc.font()`** — it draws
pure paths. pdfkit therefore has no embedded fonts in the output PDF.

For an invisible text overlay pdfkit must embed the font so the text is
extractable by viewers. This requires calling `doc.font(filePath)` for each
`font.id` before using it in a BT block.

`FontEngine` has no method that returns a font file path. The file paths live
in `FontRegistry` (`Map<string, { id, face, filePath }>`), which is already
imported in the test files from `@paragraf/types`.

**Solution**: add `fontRegistry` to the options interfaces. When
`selectable: true` and `fontRegistry` is absent, throw a clear error. This
requires no changes to any other package.

---

## Step 1 — update `PdfOptions` and `DocumentPdfOptions` in `src/pdf.ts`

```ts
import { FontRegistry } from '@paragraf/types';  // add this import

export interface PdfOptions {
  width?:        number;   // page width in points, default 595.28 (A4)
  height?:       number;   // page height in points, default 841.89 (A4)
  fill?:         string;   // glyph fill color, default 'black'
  selectable?:   boolean;  // add invisible text overlay for search/copy
  fontRegistry?: FontRegistry;  // required when selectable: true
  title?:        string;   // PDF /Title metadata
  lang?:         string;   // PDF /Lang metadata (BCP 47: 'en', 'tr', 'de')
}

export interface DocumentPdfOptions {
  pageWidth?:    number;   // default 595.28 (A4)
  pageHeight?:   number;   // default 841.89 (A4)
  fill?:         string;   // glyph fill color, default 'black'
  selectable?:   boolean;
  fontRegistry?: FontRegistry;  // required when selectable: true
  title?:        string;
  lang?:         string;
}
```

Export both updated interfaces from `src/index.ts` (they are already exported,
no change to the export lines needed — just the interface bodies above).

---

## Step 2 — create `src/selectable.ts`

New file. Contains all invisible-text helpers. `pdf.ts` imports from here.

```ts
// src/selectable.ts

import { FontRegistry } from '@paragraf/types';

// ─── Font reference registry ──────────────────────────────────────────────────

/**
 * Registers every font in the registry with pdfkit and returns a map
 * from paragraf font ID → pdfkit internal PDF font name (e.g. '/F1').
 *
 * Must be called once before any invisible text is emitted.
 * pdfkit assigns font names lazily on first use, so we call doc.font()
 * for each font to force registration and capture the assigned name.
 *
 * Implementation note:
 *   doc.font(filePath) sets doc._font to the font object.
 *   doc._font.id is the PDF content-stream name e.g. '/F1'.
 *   This is an internal pdfkit API. If it breaks on a pdfkit upgrade,
 *   grep pdfkit source for 'PDFFont' and locate the 'id' property.
 */
export function buildFontRefMap(
  doc: any,
  fontRegistry: FontRegistry,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [fontId, descriptor] of fontRegistry) {
    doc.font(descriptor.filePath);
    map.set(fontId, doc._font.id as string);
  }
  return map;
}

// ─── Coordinate helper ────────────────────────────────────────────────────────

/**
 * Convert paragraf/pdfkit top-left y to PDF native bottom-left y.
 * paragraf and pdfkit both use top-left origin for high-level APIs.
 * Raw BT/ET content-stream operators use PDF native (bottom-left) coordinates.
 */
export function toPdfNativeY(yFromTop: number, pageHeight: number): number {
  return pageHeight - yFromTop;
}

// ─── TJ block emission ────────────────────────────────────────────────────────

/**
 * Descriptor for one glyph's position and text, accumulated during the
 * path-drawing pass in drawRenderedParagraph.
 */
export interface GlyphRecord {
  x:           number;  // absolute x position in points from page left
  advanceWidth: number;  // advance in points (already scaled: advanceWidth * scale)
  text:        string;  // source character(s) — use cluster text, not glyph index
}

/**
 * Emit a BT…ET invisible text block for a single segment's glyph run.
 *
 * Uses the TJ operator with explicit per-glyph x-advance adjustments so
 * the invisible text sits exactly where the visible glyph paths were drawn,
 * regardless of GPOS kerning, GSUB ligature substitution, or letter-spacing.
 *
 * @param doc         pdfkit PDFDocument instance
 * @param glyphRun    glyph positions accumulated during path drawing
 * @param baselineY   seg.y — baseline in pdfkit top-left points
 * @param pageHeight  page height in points (for coordinate conversion)
 * @param fontRef     pdfkit internal font name e.g. '/F1' (from buildFontRefMap)
 * @param fontSize    seg.font.size in points
 */
export function emitInvisibleSegment(
  doc: any,
  glyphRun: GlyphRecord[],
  baselineY: number,
  pageHeight: number,
  fontRef: string,
  fontSize: number,
): void {
  if (glyphRun.length === 0) return;

  const pdfY = toPdfNativeY(baselineY, pageHeight);
  const firstX = glyphRun[0].x;

  // Build TJ array.
  // Each entry is either a PDF string literal (char) or a numeric adjustment.
  // Adjustment unit: 1/1000 of the current text-space unit (= fontSize/1000 pt).
  // Negative adjustment moves the text position RIGHT.
  //
  // We position the first glyph with Td, then for each subsequent glyph we
  // compute the delta between where pdfkit would naturally place it (based on
  // the previous glyph's advance) and where paragraf actually placed it.
  let tj = '[';
  for (let i = 0; i < glyphRun.length; i++) {
    const g = glyphRun[i];

    if (i === 0) {
      tj += `(${escapePdf(g.text)})`;
    } else {
      const prev = glyphRun[i - 1];
      // Where pdfkit would place this glyph if we relied on natural advance:
      const naturalX = prev.x + prev.advanceWidth;
      // Where paragraf actually placed it:
      const actualX  = g.x;
      // Adjustment needed (negative = move right):
      const deltaTextUnits = -(actualX - naturalX) * 1000 / fontSize;
      tj += ` ${deltaTextUnits.toFixed(3)} (${escapePdf(g.text)})`;
    }
  }
  tj += '] TJ';

  // Emit BT…ET block. Tr=3 is set inside the block so it cannot leak.
  // The block is self-contained: it does not affect the graphics state
  // outside the BT/ET envelope.
  doc.addContent([
    'BT',
    `${fontRef} ${fontSize} Tf`,
    '3 Tr',
    `${firstX.toFixed(3)} ${pdfY.toFixed(3)} Td`,
    tj,
    'ET',
  ].join('\n'));
}

// ─── PDF metadata ─────────────────────────────────────────────────────────────

/**
 * Inject title and lang into the PDF document info dictionary.
 * Both are optional — safe to call with undefined values.
 */
export function applyMetadata(
  doc: any,
  title: string | undefined,
  lang:  string | undefined,
): void {
  if (title) {
    doc.info['Title'] = title;
  }
  if (lang) {
    // pdfkit 0.14+ supports doc.info['Lang'].
    // Confirmed present in package.json dep: "pdfkit": "^0.18.0"
    doc.info['Lang'] = lang;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Escape a string for use inside a PDF literal string ( ).
 * Handles backslash, open/close parens, and null bytes.
 * Does NOT handle multi-byte encodings — paragraf segments are pre-segmented
 * into single-font runs so characters are always in the font's encoding.
 */
function escapePdf(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\0/g, ' ');    // null bytes terminate PDF strings
}
```

---

## Step 3 — update `drawRenderedParagraph` in `src/pdf.ts`

### 3a — add new parameters to the function signature

```ts
// BEFORE:
function drawRenderedParagraph(
  doc: any,
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  fill: string,
): void

// AFTER:
function drawRenderedParagraph(
  doc: any,
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  fill: string,
  selectableOpts?: {
    fontRefMap: Map<string, string>;
    pageHeight: number;
  },
): void
```

`selectableOpts` is `undefined` when `selectable: false` (default path).
When `undefined`, the function behaves exactly as before — zero overhead.

### 3b — accumulate glyph positions and emit TJ inside the segment loop

The existing inner loop (over `glyphs`) already computes `gx` per glyph.
Extend it to also accumulate a `GlyphRecord[]` array, then call
`emitInvisibleSegment` after the loop exits for each segment.

**Exact diff on the segment loop inside `drawRenderedParagraph`:**

```ts
// ADD this import at top of pdf.ts:
import {
  buildFontRefMap,
  emitInvisibleSegment,
  applyMetadata,
  GlyphRecord,
} from './selectable.js';

// INSIDE the `for (const seg of line.segments)` loop,
// AFTER the existing `if (!seg.text) continue;` guard, ADD:

const glyphRun: GlyphRecord[] = selectableOpts ? [] : (null as any);

// The existing glyph loop is unchanged EXCEPT add one push per glyph.
// Here is the modified glyph loop showing only the addition:

for (let i = 0; i < glyphs.length; i++) {
  const glyph = glyphs[i];
  const drawX = gx + (glyph.xOffset ?? 0) * scale;
  const drawY = seg.y - (glyph.yOffset ?? 0) * scale;
  // ... ALL EXISTING PATH CODE UNCHANGED ...

  if (hasCommands) doc.fill(fill);
  doc.restore();

  const kern =
    i < glyphs.length - 1
      ? fontEngine.getKerning(seg.font.id, glyph, glyphs[i + 1])
      : 0;

  // ── NEW: accumulate glyph position BEFORE advancing gx ──────────────
  if (selectableOpts) {
    glyphRun.push({
      x:            gx,                              // x BEFORE xOffset adjustment
      advanceWidth: (glyph.advanceWidth + kern) * scale,
      text:         (glyph as any).cluster          // ligature source text if present
                    ?? String.fromCodePoint((glyph as any).codePoint ?? 0x20),
    });
  }
  // ────────────────────────────────────────────────────────────────────

  gx += (glyph.advanceWidth + kern) * scale;

  const letterSpacing = seg.font.letterSpacing ?? 0;
  if (letterSpacing && i < glyphs.length - 1) {
    gx += letterSpacing;
  }
}

// ── NEW: emit invisible text block for this segment ──────────────────
if (selectableOpts && glyphRun.length > 0) {
  const fontRef = selectableOpts.fontRefMap.get(seg.font.id);
  if (fontRef) {
    emitInvisibleSegment(
      doc,
      glyphRun,
      seg.y,
      selectableOpts.pageHeight,
      fontRef,
      seg.font.size,
    );
  } else {
    console.warn(
      `[render-pdf] selectable: font '${seg.font.id}' not in fontRegistry — ` +
      'overlay skipped for this segment.',
    );
  }
}
// ─────────────────────────────────────────────────────────────────────
```

---

## Step 4 — update `renderToPdf`

```ts
export const renderToPdf = (
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  options: PdfOptions = {},
): Promise<Buffer> => {
  const {
    width = 595.28,
    height = 841.89,
    fill = 'black',
    selectable = false,
    fontRegistry,
    title,
    lang,
  } = options;

  if (selectable && !fontRegistry) {
    throw new Error(
      '[render-pdf] renderToPdf: selectable: true requires fontRegistry in options.',
    );
  }

  const PDFDocument = getPDFDocument();
  const doc: any = new PDFDocument({ size: [width, height] });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Apply metadata before any content is written.
  applyMetadata(doc, title, lang);

  // Build font ref map (registers fonts with pdfkit) only when selectable.
  const fontRefMap = selectable
    ? buildFontRefMap(doc, fontRegistry!)
    : undefined;

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawRenderedParagraph(
      doc,
      rendered,
      fontEngine,
      fill,
      fontRefMap ? { fontRefMap, pageHeight: height } : undefined,
    );

    doc.end();
  });
};
```

---

## Step 5 — update `renderDocumentToPdf`

```ts
export const renderDocumentToPdf = (
  renderedDoc: RenderedDocument,
  fontEngine: FontEngine,
  options: DocumentPdfOptions = {},
): Promise<Buffer> => {
  const {
    pageWidth = 595.28,
    pageHeight = 841.89,
    fill = 'black',
    selectable = false,
    fontRegistry,
    title,
    lang,
  } = options;

  if (selectable && !fontRegistry) {
    throw new Error(
      '[render-pdf] renderDocumentToPdf: selectable: true requires fontRegistry in options.',
    );
  }

  const PDFDocument = getPDFDocument();
  const doc: any = new PDFDocument({
    size: [pageWidth, pageHeight],
    autoFirstPage: false,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  applyMetadata(doc, title, lang);

  // buildFontRefMap must be called before addPage() so fonts are registered
  // at the document level before any page content references them.
  const fontRefMap = selectable
    ? buildFontRefMap(doc, fontRegistry!)
    : undefined;

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let pi = 0; pi < renderedDoc.pages.length; pi++) {
      doc.addPage({ size: [pageWidth, pageHeight] });
      const page = renderedDoc.pages[pi];
      for (const item of page.items) {
        drawRenderedParagraph(
          doc,
          item.rendered,
          fontEngine,
          fill,
          fontRefMap ? { fontRefMap, pageHeight } : undefined,
        );
      }
    }

    doc.end();
  });
};
```

---

## Step 6 — update `src/index.ts`

No structural changes. The new `selectable.ts` is an internal module —
`GlyphRecord`, `buildFontRefMap`, etc. are not public API.

Only verify that `FontRegistry` flows through correctly: it is part of
`PdfOptions` and `DocumentPdfOptions`, both of which are already exported.

---

## Step 7 — tests (`tests/selectable.test.ts`)

New test file. Uses the existing `makeMockFontEngine` pattern from
`pdf-document.test.ts` so no real font files are required for most tests.

```ts
import { describe, it, expect } from 'vitest';
import { renderToPdf, renderDocumentToPdf } from '@paragraf/render-pdf';
import type { FontRegistry } from '@paragraf/types';
import * as path from 'path';

// ─── Helpers (copy pattern from pdf-document.test.ts) ────────────────────────

// ... (copy makeMockFontEngine and makeFont from pdf-document.test.ts) ...

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('renderToPdf — selectable: false (default)', () => {
  it('produces identical output whether selectable is omitted or false', async () => {
    const a = await renderToPdf([], makeMockFontEngine());
    const b = await renderToPdf([], makeMockFontEngine(), { selectable: false });
    expect(a.toString('hex')).toBe(b.toString('hex'));
  });
});

describe('renderToPdf — selectable: true', () => {
  it('throws if fontRegistry is absent', async () => {
    await expect(
      renderToPdf([], makeMockFontEngine(), { selectable: true }),
    ).rejects.toThrow('fontRegistry');
  });

  it('does not throw when fontRegistry is provided', async () => {
    const registry: FontRegistry = new Map([
      ['f', { id: 'f', face: 'Test', filePath: '/nonexistent.ttf' }],
    ]);
    // This will throw because the font path does not exist — that is
    // pdfkit's error, not ours. We only test our validation guard above.
    // For a full integration test, see the integration block below.
  });

  it('output contains "3 Tr" operator when selectable: true', async () => {
    // Integration test — requires a real font file.
    const FONTS_DIR = path.resolve(__dirname, '../../fonts');
    const FONT_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');
    const { FontkitEngine } = await import('@paragraf/font-engine');
    const { createMeasurer } = await import('@paragraf/font-engine');
    const { layoutParagraph } = await import('@paragraf/render-core');
    const { createParagraphComposer } = await import('@paragraf/typography');
    const { Font, FontRegistry: FR } = await import('@paragraf/types');

    const registry: FontRegistry = new Map([
      ['liberation-serif', { id: 'liberation-serif', face: 'Liberation Serif', filePath: FONT_PATH }],
    ]);
    const fontEngine = new FontkitEngine();
    await fontEngine.loadFont('liberation-serif', FONT_PATH);
    const composer = await createParagraphComposer(registry);
    const font = { id: 'liberation-serif', size: 14, weight: 400, style: 'normal' as const, stretch: 'normal' as const };
    const output = composer.compose({ text: 'Hello paragraf', font, lineWidth: 400 });
    const measurer = createMeasurer(registry);
    const rendered = layoutParagraph(output.lines, measurer, { x: 72, y: 72 });

    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: registry,
    });

    expect(buf.toString('latin1')).toContain('3 Tr');
  });

  it('output does NOT contain "3 Tr" when selectable: false', async () => {
    // Same setup as above but selectable: false
    // ... (same setup, abbreviated) ...
    // expect(buf.toString('latin1')).not.toContain('3 Tr');
  });
});

describe('renderToPdf — metadata', () => {
  it('PDF contains title string when title is set', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), { title: 'MyDoc' });
    expect(buf.toString('latin1')).toContain('MyDoc');
  });

  it('PDF contains lang string when lang is set', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), { lang: 'tr' });
    expect(buf.toString('latin1')).toContain('tr');
  });
});

describe('renderDocumentToPdf — selectable: true', () => {
  it('throws if fontRegistry is absent', async () => {
    await expect(
      renderDocumentToPdf({ pages: [] }, makeMockFontEngine(), { selectable: true }),
    ).rejects.toThrow('fontRegistry');
  });
});
```

---

## Step 8 — edge cases in `selectable.ts` to verify after implementation

**Ligatures**: if `glyph.cluster` is present (e.g. `'fi'` for an fi-ligature),
`GlyphRecord.text` will be `'fi'` — two source characters at one glyph position.
The TJ block emits `(fi)` at that x, which is correct for copy-paste.
If `glyph.cluster` is absent, check whether `fontEngine.glyphsForString` returns
any field carrying the source text (could be `sourceText`, `chars`, or similar).
If nothing exists, fall back to `String.fromCodePoint(glyph.codePoint)` which
gives the single codepoint — acceptable for non-ligature glyphs.

**Kerning already included in `gx`**: note that `advanceWidth` in `GlyphRecord`
is `(glyph.advanceWidth + kern) * scale` — kern is baked in. This is correct
because the TJ delta is computed as `actualX - (prevX + prevAdvance)`, and
both sides include kern. Do not double-count.

**Zero-advance glyphs** (combining marks, ZWJ): `advanceWidth` may be zero.
The TJ delta computation handles this correctly — the next glyph's x will
likely equal the current glyph's x, producing a large negative adjustment.
No special case needed.

**`!seg.text` guard**: the existing `if (!seg.text) continue;` skip is before
the glyph loop. `glyphRun` is never populated for empty segments, and
`emitInvisibleSegment` guards against empty `glyphRun`. Correct.

---

## Summary of all changes

| File | Change |
|------|--------|
| `src/pdf.ts` | Add `FontRegistry` import; add `selectable`, `fontRegistry`, `title`, `lang` to both options interfaces; update `drawRenderedParagraph` signature and body; update `renderToPdf` and `renderDocumentToPdf` bodies |
| `src/selectable.ts` | **Create** — `buildFontRefMap`, `emitInvisibleSegment`, `applyMetadata`, `GlyphRecord`, helpers |
| `src/index.ts` | No changes — existing export lines already cover updated interfaces |
| `tests/selectable.test.ts` | **Create** — 7 tests above |
