// scripts/demo.ts — manual test output
// Run:  npx tsx scripts/demo.ts
// Output files land in:  output/demo.pdf  and  output/demo.svg

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createParagraphComposer, createDefaultFontEngine } from '../src/paragraph.js';
import { createMeasurer } from '../src/measure.js';
import { layoutParagraph, renderToSvg } from '../src/render.js';
import { renderToPdf } from '../src/pdf.js';
import { Font, FontRegistry, TextSpan } from '../src/types.js';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '../fonts');
const OUTPUT_DIR = path.resolve(__dirname, '../output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Registry ────────────────────────────────────────────────────────────────

const REGISTRY: FontRegistry = new Map([
  [
    'serif-regular',
    {
      id: 'serif-regular',
      face: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
  [
    'serif-bold',
    {
      id: 'serif-bold',
      face: 'Liberation Serif Bold',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
    },
  ],
  [
    'serif-italic',
    {
      id: 'serif-italic',
      face: 'Liberation Serif Italic',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
    },
  ],
]);

// ─── Fonts ───────────────────────────────────────────────────────────────────

const makeFont = (id: string, size: number, extra?: Partial<Font>): Font => ({
  id,
  size,
  weight: id.includes('bold') ? 700 : 400,
  style: id.includes('italic') ? 'italic' : 'normal',
  stretch: 'normal',
  ...extra,
});

const F12 = makeFont('serif-regular', 12);
const F12B = makeFont('serif-bold', 12);
const F12I = makeFont('serif-italic', 12);
const F10 = makeFont('serif-regular', 10);
const F8SUP = makeFont('serif-regular', 8, { variant: 'superscript' });
const F8SUB = makeFont('serif-regular', 8, { variant: 'subscript' });

// ─── Page layout constants ────────────────────────────────────────────────────

const PAGE_W = 595.28; // A4 pts
const PAGE_H = 841.89;
const MARGIN_X = 72; // 1-inch margins
const MARGIN_TOP = 72;
const LINE_W = PAGE_W - MARGIN_X * 2; // 451.28 pt content width

// ─── Demo ────────────────────────────────────────────────────────────────────

const composer = await createParagraphComposer(REGISTRY);
const measurer = createMeasurer(REGISTRY);
const fontEngine = await createDefaultFontEngine(REGISTRY);

let cursorY = MARGIN_TOP;

// collect all rendered lines for the full page
const allLines: ReturnType<typeof layoutParagraph> = [];

const compose = (
  spans: TextSpan[] | undefined,
  text: string | undefined,
  font: Font,
  lineWidth: number = LINE_W,
  gapAfter: number = 6,
) => {
  const output = composer.compose({
    spans,
    text,
    font,
    lineWidth,
    tolerance: 3,
  });
  const rendered = layoutParagraph(output.lines, measurer, {
    x: MARGIN_X,
    y: cursorY,
  });
  allLines.push(...rendered);
  const totalH = rendered.reduce((n, l) => n + l.lineHeight, 0);
  cursorY += totalH + gapAfter;
  return output.lineCount;
};

// — Title
compose(
  undefined,
  'PaCo — Paragraph Composer Demo',
  makeFont('serif-bold', 18),
  LINE_W,
  12,
);

// — Subtitle
compose(
  undefined,
  'Knuth–Plass optimal line-breaking with OpenType font metrics',
  makeFont('serif-italic', 12),
  LINE_W,
  14,
);

// — Body paragraph 1: ligatures (fi, fl, ff)
compose(
  undefined,
  'The Knuth–Plass algorithm finds the globally optimal set of line breaks for a paragraph, ' +
    'minimising a cost function based on how tightly or loosely each line is fitted. ' +
    'Unlike first-fit greedy algorithms, it considers all feasible breakpoints simultaneously. ' +
    'Difficult ligatures such as "fi", "fl", and "ffi" are resolved automatically through GSUB lookup tables.',
  F12,
  LINE_W,
  10,
);

// — Body paragraph 2: mixed fonts (bold + italic inline)
compose(
  [
    { text: 'Mixed-font spans are fully supported. ', font: F12 },
    { text: 'Bold text', font: F12B },
    { text: ' and ', font: F12 },
    { text: 'italic text', font: F12I },
    {
      text:
        ' flow together in the same paragraph, each measured with its own OpenType metrics. ' +
        'Word spacing is computed from the first inter-word glue on each line.',
      font: F12,
    },
  ],
  undefined,
  F12,
  LINE_W,
  10,
);

// — Body paragraph 3: superscript / subscript
compose(
  [
    {
      text:
        'Superscript and subscript use OS/2 metrics for baseline shift. ' +
        'For example: E = mc',
      font: F12,
    },
    {
      text: '2',
      font: F8SUP,
      verticalOffset: measurer.metrics(F8SUP).baselineShift,
    },
    { text: ' or H', font: F12 },
    {
      text: '2',
      font: F8SUB,
      verticalOffset: measurer.metrics(F8SUB).baselineShift,
    },
    {
      text: 'O. Glyph widths are substituted via GSUB (sups/subs features) before measurement.',
      font: F12,
    },
  ],
  undefined,
  F12,
  LINE_W,
  10,
);

// — Narrower column (to show tighter breaking)
cursorY += 6;
compose(
  undefined,
  'Narrow column (200 pt): The algorithm handles variable line widths gracefully, ' +
    'adjusting hyphenation and spacing to maintain even typographic colour across all lines.',
  F10,
  200,
  10,
);

// ─── PDF ─────────────────────────────────────────────────────────────────────

const pdfBuf = await renderToPdf(allLines, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
const pdfPath = path.join(OUTPUT_DIR, 'demo.pdf');
fs.writeFileSync(pdfPath, pdfBuf);
console.log(`PDF  →  ${pdfPath}  (${(pdfBuf.length / 1024).toFixed(1)} KB)`);

// ─── SVG ─────────────────────────────────────────────────────────────────────

const svgStr = renderToSvg(allLines, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
const svgPath = path.join(OUTPUT_DIR, 'demo.svg');
fs.writeFileSync(svgPath, svgStr, 'utf8');
console.log(`SVG  →  ${svgPath}  (${(svgStr.length / 1024).toFixed(1)} KB)`);

// ─── Summary ─────────────────────────────────────────────────────────────────

const totalSegments = allLines.reduce((n, l) => n + l.segments.length, 0);
console.log(
  `\nLines: ${allLines.length}  |  Segments: ${totalSegments}  |  Page cursor: ${cursorY.toFixed(1)} pt`,
);
console.log('\nOpen output files:');
console.log(`  open ${pdfPath}`);
console.log(`  open ${svgPath}`);
