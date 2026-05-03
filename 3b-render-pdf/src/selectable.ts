// selectable.ts — invisible text overlay for PDF text selection / copy-paste
//
// Strategy: after drawing each segment as vector paths (the existing approach),
// emit a BT…ET block with rendering mode 3 (Tr=3, invisible fill+stroke) so PDF
// viewers can hit-test and extract the original Unicode text.
//
// Encoding: use pdfkit's own font.encode() which returns the same hex glyph IDs
// that pdfkit writes in its content streams.  The ToUnicode CMap (written lazily
// by pdfkit on first encode() call) maps those IDs back to Unicode, so
// copy-paste works for ASCII, ligatures, and non-ASCII characters alike.

import type { FontRegistry } from '@paragraf/types';
import type { RenderedParagraph } from '@paragraf/render-core';

// ─── Invisible segment emitter ────────────────────────────────────────────────

/**
 * Emit a BT…ET invisible-text block for one rendered segment.
 *
 * Must be called AFTER the glyph paths for the segment have been drawn so the
 * graphics-state save/restore stack is clean.
 *
 * @param doc      - pdfkit PDFDocument instance (typed as `any`)
 * @param text     - original Unicode text for the segment
 * @param x        - segment baseline X in paragraf / pdfkit user-space coordinates (points)
 * @param y        - segment baseline Y in paragraf / pdfkit user-space coordinates (top = 0)
 * @param fontId   - paragraf font ID used to look up the FontDescriptor
 * @param fontSize - font size in points
 * @param registry - FontRegistry mapping fontId → FontDescriptor
 */
export function emitInvisibleSegment(
  doc: any,
  text: string,
  x: number,
  y: number,
  fontId: string,
  fontSize: number,
  registry: FontRegistry,
): void {
  const descriptor = registry.get(fontId);
  if (!descriptor) return;

  // Switch pdfkit's current font so it (a) registers the font in the page
  // resource dict and (b) builds the ToUnicode CMap lazily via encode().
  // This does NOT affect the visually-drawn paths.
  doc.font(descriptor.filePath).fontSize(fontSize);

  const font = (doc as any)._font;
  const fontRef: string = font.id;

  // Ensure the font is registered in the current page resource dict.
  (doc as any).page.fonts[fontRef] = font.ref();

  // Encode text → array of 4-char hex glyph IDs (same format pdfkit uses
  // internally in its own TJ operators, so ToUnicode maps them correctly).
  const [hexGlyphs]: [string[], unknown[]] = font.encode(text, {});
  if (!hexGlyphs.length) return;
  const hexStr = hexGlyphs.join('');

  // pdfkit sets a page-level CTM of `1 0 0 -1 0 H cm` (y-flip, top-left origin).
  // addContent writes into that same user space, so all coordinates here use
  // pdfkit's convention: x from left, y from top.
  //
  // We use `Tm 1 0 0 -1 x y` rather than `Td x y`:
  //  • Td with a simple identity matrix would render glyphs upside-down (ascenders
  //    going downward) because the page CTM flips the y-axis.
  //  • Tm with d=-1 counter-flips the font orientation so the combined transform
  //    (Tm × CTM) has a positive y-scale: text is upright and ascenders go up.
  //  • Baseline lands at native y = H - y (correct for pdfkit user-space y from top).
  (doc as any).addContent(
    [
      'BT',
      `/${fontRef} ${fontSize} Tf`,
      '3 Tr',
      `1 0 0 -1 ${x} ${y} Tm`,
      `<${hexStr}> Tj`,
      'ET',
    ].join('\n'),
  );
}

// ─── Document metadata ────────────────────────────────────────────────────────

/**
 * Set optional metadata on the PDF Info dictionary.
 * When pdfxConformance is set, also writes GTS_PDFXVersion and Trapped.
 * Must be called before doc.end().
 */
export function applyMetadata(
  doc: any,
  title?: string,
  lang?: string,
  pdfxConformance?: 'PDF/X-3:2002' | 'PDF/X-3:2003',
): void {
  if (title) (doc as any).info['Title'] = title;
  if (lang) (doc as any).info['Lang'] = lang;
  if (pdfxConformance) {
    (doc as any).info['GTS_PDFXVersion'] = pdfxConformance;
    // Trapped is a PDF Name in the spec (/False). pdfkit serializes info values as
    // strings; most validators accept this. A future improvement could use a raw
    // PDFKit reference to emit a true Name object.
    (doc as any).info['Trapped'] = 'False';
  }
}

// ─── Hit-testing ─────────────────────────────────────────────────────────────

/** Identifies the segment at a given page-coordinate point. */
export interface HitResult {
  /** Zero-based index of the line within the `RenderedParagraph`. */
  lineIndex: number;
  /** Zero-based index of the segment within `RenderedLine.segments`. */
  segmentIndex: number;
}

/**
 * Find which segment of a `RenderedParagraph` contains a given page-coordinate
 * point `{ x, y }`.
 *
 * The vertical hit band for a line is `[baseline − lineHeight, baseline]`.
 * Within a matched line the chosen segment is the last one whose `x` origin
 * is ≤ `px` (i.e. the segment immediately to the left of the click). If the
 * point is to the left of all segments the first segment is returned.
 *
 * Returns `null` when the point does not fall inside any line's vertical band.
 *
 * Note: charOffset (caret position within a segment) is not returned here —
 * it requires per-glyph advance data not present in `PositionedSegment`.
 */
export function hitTestRendered(
  rendered: RenderedParagraph,
  point: { x: number; y: number },
): HitResult | null {
  const { x: px, y: py } = point;

  for (let li = 0; li < rendered.length; li++) {
    const line = rendered[li];
    const top = line.baseline - line.lineHeight;
    const bottom = line.baseline;

    if (py < top || py > bottom) continue;

    // Point is within this line's vertical band. Find the best segment.
    const segs = line.segments;
    if (segs.length === 0) return { lineIndex: li, segmentIndex: 0 };

    // Last segment whose x-start is ≤ px; fall back to segment 0.
    let best = 0;
    for (let si = 0; si < segs.length; si++) {
      if (segs[si].x <= px) best = si;
    }

    return { lineIndex: li, segmentIndex: best };
  }

  return null;
}
