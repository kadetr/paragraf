// manual/fixtures/header.ts
// Shared test-header renderer.
//
// Every manual-test output (PDF and SVG) carries a compact explanation band
// at the top of the page containing:
//   • Purpose  — what the test verifies
//   • Uses     — @paragraf packages exercised
//   • Pass     — success criteria
//   • Fail     — failure modes
//
// Two entry points:
//   drawTestHeader(doc, id)        — draw on an open pdfkit PDFDocument
//   addSvgTestHeader(svg, id)      — inject a <g> block into an SVG string

// ─── Header content ───────────────────────────────────────────────────────────

interface HeaderInfo {
  title: string;
  purpose: string;
  packages: string;
  pass: string;
  fail: string;
}

const HEADERS: Record<string, HeaderInfo> = {
  'MT-01': {
    title: 'LTR Typography Quality',
    purpose:
      'Compare Knuth-Plass (KP) vs greedy line-breaking on English body text. KP should achieve lower ratio variance.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'KP ratio variance < 0.15, no emergency stretching used',
    fail: 'KP variance ≥ 0.15, or emergency stretching triggered',
  },
  'MT-02': {
    title: 'RTL Hebrew Paragraph',
    purpose:
      'Verify RTL Hebrew paragraph flows right-to-left with correct word order and no hyphenation.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Lines flow RTL, correct word order, no hyphens, no overflow',
    fail: 'LTR layout, reversed word order, visible hyphens, or overflow',
  },
  'MT-03': {
    title: 'Arabic Paragraph',
    purpose:
      'Verify Arabic RTL detection, correct script shaping and joining, no hyphenation, no overflow.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Text correctly shaped right-to-left, joins present, no overflow',
    fail: 'Missing glyph joins, LTR layout, or overflow characters',
  },
  'MT-04': {
    title: 'Superscript / Subscript Rendering',
    purpose:
      'Verify superscript/subscript spans (H₂O-style) render with correct vertical offsets at reduced font size.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Sub/superscripts visually offset above/below baseline at smaller size',
    fail: 'Flat baseline, wrong font size, or ascenders/descenders clipped',
  },
  'MT-05': {
    title: 'Mixed-Font Paragraph',
    purpose:
      'Verify line height adapts to the tallest font in a mixed-font run; baselines stay consistent across spans.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Consistent baselines, no glyph clipping across different font sizes',
    fail: 'Uneven baselines, or ascenders clipped by the dominant line height',
  },
  'MT-06': {
    title: 'Long URL / No-Break Word',
    purpose:
      'Verify emergency-stretch rescues a line that overflows due to an unbreakable URL in a narrow column.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'emergencyUsed=true, URL fits within the column width',
    fail: 'Line overflows column boundary, or emergencyUsed=false',
  },
  'MT-07': {
    title: 'Widow / Orphan Control',
    purpose:
      'Compare with/without widow+orphan penalties. Last paragraph line should have ≥2 words when penalties are on.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Final line has ≥2 words when penalties enabled',
    fail: 'Single-word final line (widow) when penalties are enabled',
  },
  'MT-08': {
    title: 'Consecutive Hyphen Limit',
    purpose:
      'Verify the longest run of consecutive hyphenated lines stays within the configured limit of 2.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Max consecutive hyphen run ≤ 2',
    fail: '3 or more consecutive hyphenated lines in the output',
  },
  'MT-09': {
    title: 'Variable Line Widths',
    purpose:
      'Verify per-line width variation: first 3 lines use a narrow column (wrap around image), rest use full width.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Lines 0–2 fit narrow column; lines 3+ expand to full column width',
    fail: 'Narrow lines overflow, or full-width lines fail to expand',
  },
  'MT-10': {
    title: 'Canvas vs SVG Rendering Parity',
    purpose:
      'Verify SVG and Canvas renderers both complete on identical typeset layout. Canvas counts glyph contours (moveTo per contour); SVG groups all contours into one <path> per glyph — so canvas/SVG ratio is consistently ~1.5×, not 1.0×.',
    packages:
      'typography · font-engine · render-core (renderToSvg + renderToCanvas) · render-pdf',
    pass: 'Both renderers complete on the same layout; canvas moveTo/SVG path ratio is stable across runs (~1.5× — multi-contour glyphs split into separate moveTo calls in Canvas)',
    fail: 'Either renderer throws; or canvas/SVG ratio jumps dramatically between runs (ratio should stay near 1.5×)',
  },
  'MT-11': {
    title: 'WASM vs TS Composition Parity',
    purpose:
      'Verify WASM and TypeScript composition backends produce identical line counts and word sequences.',
    packages:
      'typography (WASM + TS paths) · font-engine · render-core · render-pdf',
    pass: 'Line count and words-per-line identical between WASM and TS backends',
    fail: 'Divergent line breaks or different word arrangement between backends',
  },
  'MT-12': {
    title: 'PDF Structural Integrity',
    purpose:
      'Verify PDF output starts with %PDF- and ends with %%EOF; combined English+Hebrew in one file.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'Valid PDF magic bytes; English and Hebrew text composited in one document',
    fail: 'Missing/corrupt PDF header, truncated file, or missing script support',
  },
  'MT-13': {
    title: 'Large Document Stress Test',
    purpose:
      'Compose 100 paragraphs alternating EN_BODY/EN_NARROW and verify idempotency across the batch.',
    packages: 'typography',
    pass: 'All 100 paragraphs composed; para[0] line count == para[96] line count',
    fail: 'Divergent line counts between paragraphs, or crash/exception during composition',
  },
  'MT-14': {
    title: 'Baseline Grid Alignment',
    purpose:
      'Verify every rendered baseline lands on the 14pt grid (±0.5pt tolerance) in a two-column layout.',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'All baselines land on the 14pt grid within ±0.5pt',
    fail: 'One or more baselines fall off the grid by more than 0.5pt',
  },
  'MT-15': {
    title: 'Optical Margin Alignment',
    purpose:
      'Verify optical margin alignment (OMA) introduces non-zero xOffset variance by protruding punctuation slightly into the margin; OMA-off should have zero xOffset variance (all lines flush to MARGIN_X).',
    packages: 'typography · font-engine · render-core · render-pdf',
    pass: 'OMA-on produces non-zero xOffset variance (punctuation protrudes into margin); OMA-off xOffset variance = 0',
    fail: 'OMA-on xOffset variance = 0 — optical adjustment has no visible effect on line start positions',
  },
  'MT-16': {
    title: 'Font Size Sweep',
    purpose:
      'Sweep font size 8–24pt and verify that larger font sizes produce more lines (text wraps sooner).',
    packages: 'typography · font-engine · render-core',
    pass: 'lineCount(24pt) > lineCount(8pt); all SVG variants produced without error',
    fail: 'Non-monotonic line counts, or render error at any font size',
  },
  'MT-17': {
    title: 'Line Height Sweep',
    purpose:
      'Sweep leading multiplier 1.0–2.0× and verify that taller leading produces more total content height.',
    packages: 'typography · font-engine · render-core',
    pass: 'contentHeight(2.0×) > contentHeight(1.0×); all SVG variants produced',
    fail: 'Non-monotonic content heights, or render error at any multiplier',
  },
  'MT-18': {
    title: 'Letter Spacing Sweep',
    purpose:
      'Sweep letter spacing −0.02–0.1 em and verify wider spacing reduces the average words per line.',
    packages: 'typography · font-engine · render-core',
    pass: 'avgWordsPerLine(0.1em) < avgWordsPerLine(0em); all SVG variants produced',
    fail: 'Non-monotonic word counts, or render error at any spacing value',
  },
  'MT-19': {
    title: 'Column Width Sweep',
    purpose:
      'Sweep column width 200–600pt and verify wider columns produce fewer lines.',
    packages: 'typography · font-engine · render-core',
    pass: 'lineCount(600pt) < lineCount(200pt); all SVG variants produced',
    fail: 'Non-monotonic line counts, or render error at any column width',
  },
  'MT-20': {
    title: 'Tolerance Sweep',
    purpose:
      'Verify KP tolerance differentiates feasibility: at lineWidth=250pt, tolerance=1 is infeasible (throws), tolerance≥2 succeeds. Also verify tol≥2 all produce the same line count (narrow column) with stable ratioVar across the feasible range.',
    packages: 'typography · font-engine · render-core',
    pass: 'tol=1 throws InfeasibleLayoutError; tol=2–10 all complete and produce the same line count; ratioVar is consistent',
    fail: 'tol=1 does not throw, or tol≥2 produces different line counts, or script errors out',
  },
  'MT-21': {
    title: 'Looseness Sweep',
    purpose:
      'Sweep looseness −2 to +2 and verify negative values compress line count, positive values expand it.',
    packages: 'typography · font-engine · render-core',
    pass: 'lineCount(−2) ≤ lineCount(0) ≤ lineCount(+2)',
    fail: 'Monotonicity violated; looseness parameter has no observable effect',
  },
  'MT-22': {
    title: 'Alignment Mode Sweep',
    purpose:
      'Verify justified mode uses non-zero inter-word stretch ratios; left/right/center produce ratio≈0.',
    packages: 'typography · font-engine · render-core',
    pass: 'Justified: non-zero ratios on body lines; left/right/center: ratio≈0',
    fail: 'Justified produces ratio≈0, or a ragged mode stretches lines',
  },
  'MT-23': {
    title: 'Selectable PDF',
    purpose:
      'Verify the invisible text layer enables copy-paste of correct Unicode from outline-glyph PDFs.',
    packages:
      'typography · font-engine · render-core · render-pdf (selectable=true)',
    pass: 'Selected text copies correct Unicode — ligatures (fi fl) and non-ASCII preserved',
    fail: 'Garbled, empty, or wrong characters when pasting from a selectable PDF',
  },
  'MT-24': {
    title: 'ICC Profile Inspection',
    purpose:
      'Parse 5 ICC profiles and log all fields: colorSpace, pcs, whitePoint, matrix, TRC, a2b0/b2a0 presence.',
    packages: 'color',
    pass: 'Matrix+TRC parsed for RGB profiles; CMYK b2a0=undefined (known mft1 gap)',
    fail: 'Parsing error, missing fields, or wrong colorSpace/pcs values',
  },
  'MT-25': {
    title: 'sRGB Color Swatches (TS)',
    purpose:
      '20 named swatches through 3 transform pairs (sRGB→sRGB, sRGB↔AdobeRGB). sRGB→sRGB must be identity.',
    packages: 'color',
    pass: 'sRGB→sRGB: input == output; AdobeRGB shows subtle gamut shift on saturated hues',
    fail: 'Identity transform changes any channel, or gamut remapping is incorrect',
  },
  'MT-26': {
    title: 'WASM vs TS Color Transform Parity',
    purpose:
      '20 swatches through pure-TS createTransform and WASM createWasmTransform. Max delta must be < 1e-4.',
    packages: 'color · color-wasm',
    pass: 'Both columns visually identical; max per-channel delta < 1e-4',
    fail: 'Color mismatch between TS and WASM columns for any swatch',
  },
  'MT-27': {
    title: 'Rendering Intents on Matrix Profiles',
    purpose:
      'Verify all 4 ICC rendering intents produce identical output for matrix+TRC profiles (no LUT to select from).',
    packages: 'color',
    pass: 'All 4 columns visually identical (intents are a no-op on matrix-only profiles)',
    fail: 'Any rendering intent produces a different color output from the others',
  },
  'MT-28': {
    title: 'Color Fill Rendering in PDF',
    purpose:
      'Render 5 fill colors as typeset paragraphs via 3 transform variants. No-transform and sRGB→sRGB must look identical.',
    packages: 'color · typography · render-pdf',
    pass: 'No-transform == sRGB→sRGB visually; AdobeRGB shows slight hue shift on reds and blues',
    fail: 'Colors near-black, wrong hue, or identity transform produces a different output',
  },
  'MT-29': {
    title: 'CMYK Transform Gap Diagnostic',
    purpose:
      'Diagnostic: trace sRGB→CMYK failure (mft1 B2A0 unreadable). Shows wrong XYZ-as-RGB fills vs correct sRGB fills.',
    packages: 'color',
    pass: 'Left (correct sRGB) and right (wrong XYZ-as-RGB) swatches are visually distinct',
    fail: 'All swatches near-black, or correct and wrong fills appear identical',
  },
  'MT-40': {
    title: 'veraPDF PDF/A-1b Validation',
    purpose:
      'Generate a paragraph PDF with sRGB OutputIntent and validate it against the PDF/A-1b specification using veraPDF.',
    packages: 'typography · font-engine · render-core · render-pdf · color',
    pass: 'veraPDF reports no violations (isCompliant=true), or veraPDF not installed (SKIP)',
    fail: 'Any PDF/A-1b rule violation reported by veraPDF',
  },
};

// ─── PDF helper ───────────────────────────────────────────────────────────────

const HEADER_H = 68; // must fit within MARGIN_TOP=72

/**
 * Draw a compact explanation band at the top of a pdfkit page (y=0..68pt).
 * Call this before drawing any content. Safe to call on every page.
 * Fits within the standard 72pt top margin so content is never obscured.
 */
export function drawTestHeader(doc: any, id: string): void {
  const info = HEADERS[id];
  if (!info) return;
  const { title, purpose, packages, pass, fail } = info;
  const W = 595.28;
  const X = 18;
  const CW = W - X * 2;
  doc.save();
  doc.rect(0, 0, W, HEADER_H).fill('#f8f8f8');
  doc
    .fillColor('#222222')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`${id} — ${title}`, X, 5, { width: CW, lineBreak: false });
  doc
    .fillColor('#555555')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Purpose: ${purpose}`, X, 19, { width: CW, lineBreak: false });
  doc
    .fillColor('#444444')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Uses: ${packages}`, X, 30, { width: CW, lineBreak: false });
  doc
    .fillColor('#2a7d2a')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Pass: ${pass}`, X, 41, { width: CW, lineBreak: false });
  doc
    .fillColor('#c0392b')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Fail: ${fail}`, X, 52, { width: CW, lineBreak: false });
  // Separator
  doc
    .moveTo(0, HEADER_H)
    .lineTo(W, HEADER_H)
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke();
  doc.restore();
}

// ─── SVG helper ───────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inject a compact explanation header into an SVG string.
 * Inserts a <g> block right after the opening <svg ...> tag.
 * The block occupies y=0..68pt and is safe within the standard 72pt top margin.
 */
export function addSvgTestHeader(svg: string, id: string): string {
  const info = HEADERS[id];
  if (!info) return svg;
  const { title, purpose, packages, pass, fail } = info;
  const W = 595.28;
  const X = 18;
  const header = `
<g id="test-header" font-family="sans-serif">
  <rect x="0" y="0" width="${W}" height="68" fill="#f8f8f8"/>
  <text x="${X}" y="15" font-size="10" font-weight="bold" fill="#222222">${id} — ${escXml(title)}</text>
  <text x="${X}" y="27" font-size="7.5" fill="#555555">Purpose: ${escXml(purpose)}</text>
  <text x="${X}" y="38" font-size="7.5" fill="#444444">Uses: ${escXml(packages)}</text>
  <text x="${X}" y="49" font-size="7.5" fill="#2a7d2a">Pass: ${escXml(pass)}</text>
  <text x="${X}" y="60" font-size="7.5" fill="#c0392b">Fail: ${escXml(fail)}</text>
  <line x1="0" y1="68" x2="${W}" y2="68" stroke="#cccccc" stroke-width="0.5"/>
</g>`;
  return svg.replace(/(<svg[^>]*>)/, `$1${header}`);
}
