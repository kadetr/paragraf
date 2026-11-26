// tests/golden/cases.ts
// Corpus for the golden-output baseline.
//
// Each case is one paragraph composed with a fixed set of parameters. The
// parameters mirror the manual scripts in tests/manual/scripts (MT-01 … MT-22)
// so that a change in line breaking shows up here as a snapshot diff before
// anyone has to look at a PDF.
//
// Adding a case: append it here, run `npm run golden:update`, review the new
// snapshot files, commit them.

import type { ParagraphInput } from '@paragraf/typography';
import {
  F12,
  F12B,
  F12I,
  F18B,
  F8SUB,
  F12HE,
  F12AR,
  font,
} from '../manual/fixtures/fonts.js';
import {
  EN_BODY,
  EN_NARROW,
  HE_PARAGRAPH,
  AR_PARAGRAPH,
} from '../manual/fixtures/text.js';
import { CONTENT_W } from '../manual/fixtures/documents.js';

export type RegistryName = 'serif' | 'hebrew' | 'arabic';

export interface GoldenCase {
  /** File-name-safe identifier; also the snapshot file name. */
  id: string;
  /** Which manual script this case mirrors, for cross-reference. */
  mirrors: string;
  registry: RegistryName;
  input: ParagraphInput;
}

// Same text as MT-06: a URL in a narrow column. Until v0.7.1 the URL could not
// be broken; it now breaks after "/" and "?" and before ".".
const LONG_URL_TEXT =
  'Optical margin alignment makes the text block appear flush. ' +
  'A long URL like https://example.com/path?q=1 causes overflow in a ' +
  'narrow column unless emergency stretch is enabled.';

// v0.7.1: a URL wider than the column, which has to run over several lines.
const WIDE_URL_TEXT =
  'The report is published at ' +
  'https://example.com/a/very/long/path/that/cannot/be/hyphenated/index.html ' +
  'and the search page at ' +
  'https://example.com/search?query=line-breaking&lang=en&page=2#results ' +
  'is updated every week.';

// v0.7.1: German compound nouns, each wider than a 200 pt column. Capitalised
// words are hyphenated by default when the language is German.
const DE_COMPOUNDS =
  'Die Donaudampfschifffahrtsgesellschaft und das ' +
  'Rindfleischetikettierungsüberwachungsgesetz sowie die ' +
  'Rechtsschutzversicherungsgesellschaften stehen im ' +
  'Bundesausbildungsförderungsgesetz nebeneinander. Ein gewöhnlicher Satz ' +
  'mit kurzen Wörtern folgt darauf und füllt die Zeilen wie zuvor.';

const en = (
  id: string,
  mirrors: string,
  overrides: Partial<ParagraphInput>,
): GoldenCase => ({
  id,
  mirrors,
  registry: 'serif',
  input: {
    text: EN_BODY,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
    ...overrides,
  },
});

export const CASES: GoldenCase[] = [
  // ── Baseline justified paragraph ───────────────────────────────────────────
  en('en-body-451-t3', 'MT-01', {}),

  // ── Column width sweep (MT-19) ─────────────────────────────────────────────
  ...[200, 300, 400, 500, 600].map((w) =>
    en(`en-body-w${w}`, 'MT-19', { lineWidth: w }),
  ),

  // ── Tolerance threshold in a narrow column (MT-20) ─────────────────────────
  // Tolerance decides whether a paragraph can be set at all; once it can, the
  // optimum normally stays the same. At 250 pt the threshold lies between 1
  // (infeasible: set by the overfull fallback) and 1.5 (sets normally). The
  // pair at 160 pt has its threshold between 2 and 3. The fallback accepts
  // any line that fits; for these two paragraphs that happens to give the
  // same lines as the higher tolerance, so the cases of a pair differ only
  // in `usedFallback`. DISTINCT_PAIRS
  // below asserts that each pair really differs.
  en('en-body-w250-t1', 'MT-20', { lineWidth: 250, tolerance: 1 }),
  en('en-body-w250-t1_5', 'MT-20', { lineWidth: 250, tolerance: 1.5 }),
  en('en-body-w250-t10', 'MT-20', { lineWidth: 250, tolerance: 10 }),
  en('en-body-w160-t2', 'MT-20', { lineWidth: 160, tolerance: 2 }),
  en('en-body-w160-t3', 'MT-20', { lineWidth: 160, tolerance: 3 }),
  // Strict mode: the same infeasible paragraph must still throw.
  en('en-body-w160-t2-strict', 'MT-20', {
    lineWidth: 160,
    tolerance: 2,
    onInfeasible: 'throw',
  }),

  // ── Looseness sweep (MT-21) ────────────────────────────────────────────────
  ...[-2, -1, 0, 1, 2].map((l) =>
    en(`en-body-w280-loose${l < 0 ? 'm' : 'p'}${Math.abs(l)}`, 'MT-21', {
      lineWidth: 280,
      looseness: l,
    }),
  ),

  // ── Alignment modes (MT-22) ────────────────────────────────────────────────
  ...(['left', 'right', 'center'] as const).map((a) =>
    en(`en-body-451-${a}`, 'MT-22', { alignment: a }),
  ),

  // ── Font sizes (MT-16) ─────────────────────────────────────────────────────
  ...[8, 10, 14, 18, 24].map((s) =>
    en(`en-body-451-size${s}`, 'MT-16', { font: font('serif-regular', s) }),
  ),

  // ── Letter spacing (MT-18) ─────────────────────────────────────────────────
  ...[-0.02, 0.05, 0.1].map((sp, i) =>
    en(`en-body-451-tracking${i}`, 'MT-18', {
      font: { ...F12, letterSpacing: sp * F12.size },
    }),
  ),

  // ── Consecutive hyphen limit in a very narrow column (MT-08) ───────────────
  en('en-body-w130-t6-hyphens-unlimited', 'MT-08', {
    lineWidth: 130,
    tolerance: 6,
    consecutiveHyphenLimit: 0,
  }),
  en('en-body-w130-t6-hyphens-limit2', 'MT-08', {
    lineWidth: 130,
    tolerance: 6,
    consecutiveHyphenLimit: 2,
  }),

  // ── Runt penalty (MT-07) ───────────────────────────────────────────────────
  // 316 pt is a width where the penalty changes the breaks of EN_BODY (MT-07
  // itself sets its own text at 384 pt).
  en('en-body-w316-runt0', 'MT-07', {
    lineWidth: 316,
    runtPenalty: 0,
    singleLinePenalty: 0,
  }),
  en('en-body-w316-runt8000', 'MT-07', {
    lineWidth: 316,
    runtPenalty: 8000,
    singleLinePenalty: 8000,
  }),

  // ── Per-line widths: first three lines narrow (MT-09) ──────────────────────
  en('en-body-linewidths-3x200', 'MT-09', {
    lineWidths: [200, 200, 200],
  }),

  // ── Unbreakable URL, with and without emergency stretch (MT-06) ────────────
  en('long-url-w200-t2-es0', 'MT-06', {
    text: LONG_URL_TEXT,
    lineWidth: 200,
    tolerance: 2,
    emergencyStretch: 0,
  }),
  en('long-url-w200-t2-es0-strict', 'MT-06', {
    text: LONG_URL_TEXT,
    lineWidth: 200,
    tolerance: 2,
    emergencyStretch: 0,
    onInfeasible: 'throw',
  }),
  en('long-url-w200-t2-es50', 'MT-06', {
    text: LONG_URL_TEXT,
    lineWidth: 200,
    tolerance: 2,
    emergencyStretch: 50,
  }),

  // ── Optical margin alignment (MT-15) ───────────────────────────────────────
  en('en-body-451-oma', 'MT-15', { opticalMarginAlignment: true }),

  // ── Adjacent-line demerits (TeX-equivalent setting) ────────────────────────
  // 300 and 400 pt are widths where the setting changes the breaks.
  ...[300, 400].map((w) =>
    en(`en-body-w${w}-adjdemerits`, 'adjDemerits', {
      lineWidth: w,
      adjDemerits: 10000,
    }),
  ),

  // ── Short narrow text ──────────────────────────────────────────────────────
  en('en-narrow-w200', 'MT-01', { text: EN_NARROW, lineWidth: 200 }),

  // ── URL break points and German nouns (v0.7.1) ─────────────────────────────
  en('wide-url-w200', 'v0.7.1', { text: WIDE_URL_TEXT, lineWidth: 200 }),
  // With hyphenation off a URL stays in one piece and sticks out, as before.
  en('wide-url-w200-nohyphenation', 'v0.7.1', {
    text: WIDE_URL_TEXT,
    lineWidth: 200,
    hyphenation: false,
  }),
  en('de-compounds-w200', 'v0.7.1', {
    text: DE_COMPOUNDS,
    lineWidth: 200,
    language: 'de',
  }),
  en('de-compounds-w200-nohyphenation', 'v0.7.1', {
    text: DE_COMPOUNDS,
    lineWidth: 200,
    language: 'de',
    hyphenation: false,
  }),

  // ── Mixed fonts and sub/superscript spans (MT-04, MT-05) ───────────────────
  {
    id: 'spans-subscript',
    mirrors: 'MT-04',
    registry: 'serif',
    input: {
      spans: [
        { text: 'H', font: F12 },
        { text: '2', font: F8SUB },
        {
          text: 'O is the molecular formula for water. The subscript numeral appears below the baseline. ',
          font: F12,
        },
        { text: 'CO', font: F12 },
        { text: '2', font: F8SUB },
        { text: ' is carbon dioxide.', font: F12 },
      ],
      font: F12,
      lineWidth: CONTENT_W,
      tolerance: 3,
    } as ParagraphInput,
  },
  {
    id: 'spans-mixed-font',
    mirrors: 'MT-05',
    registry: 'serif',
    input: {
      spans: [
        { text: 'Mixed-font spans are fully supported. ', font: F12 },
        { text: 'Bold text', font: F12B },
        { text: ' and ', font: F12 },
        { text: 'italic text', font: F12I },
        {
          text: ' flow together in the same paragraph, each measured with its own OpenType metrics. ',
          font: F12,
        },
        { text: 'A large heading word ', font: F18B },
        {
          text:
            'appears inline and its lineHeight should expand to accommodate it without clipping. ' +
            'Word spacing is computed from the dominant font on each line.',
          font: F12,
        },
      ],
      font: F12,
      lineWidth: CONTENT_W,
      tolerance: 3,
    } as ParagraphInput,
  },

  // ── Right-to-left (MT-02, MT-03) ───────────────────────────────────────────
  {
    id: 'hebrew-451-t3',
    mirrors: 'MT-02',
    registry: 'hebrew',
    input: {
      text: HE_PARAGRAPH,
      font: F12HE,
      lineWidth: CONTENT_W,
      tolerance: 3,
    } as ParagraphInput,
  },
  {
    id: 'arabic-451-t3',
    mirrors: 'MT-03',
    registry: 'arabic',
    input: {
      text: AR_PARAGRAPH,
      font: F12AR,
      lineWidth: CONTENT_W,
      tolerance: 3,
    } as ParagraphInput,
  },
];

/**
 * Pairs of cases whose parameters are meant to change the result. The test
 * fails if a pair produces identical output, because then one of the two
 * cases is not testing the parameter it is named after.
 *
 * Looseness -2 and +2 against 0 are not listed: at 280 pt the paragraph can
 * neither lose nor gain two lines, and the composer then returns the
 * looseness-0 result. That is recorded behaviour, not coverage of the
 * parameter.
 */
export const DISTINCT_PAIRS: [string, string][] = [
  ['en-body-w250-t1', 'en-body-w250-t1_5'],
  ['en-body-w160-t2', 'en-body-w160-t3'],
  ['en-body-w316-runt0', 'en-body-w316-runt8000'],
  ['en-body-w300', 'en-body-w300-adjdemerits'],
  ['en-body-w400', 'en-body-w400-adjdemerits'],
  ['en-body-w280-loosep0', 'en-body-w280-loosem1'],
  ['en-body-w280-loosep0', 'en-body-w280-loosep1'],
  ['en-body-w280-loosep1', 'en-body-w280-loosep2'],
  ['en-body-w130-t6-hyphens-unlimited', 'en-body-w130-t6-hyphens-limit2'],
  ['wide-url-w200', 'wide-url-w200-nohyphenation'],
  ['de-compounds-w200', 'de-compounds-w200-nohyphenation'],
  ['long-url-w200-t2-es0', 'long-url-w200-t2-es50'],
  ['long-url-w200-t2-es0', 'long-url-w200-t2-es0-strict'],
  ['en-body-w160-t2', 'en-body-w160-t2-strict'],
  ['en-body-451-t3', 'en-body-451-oma'],
  ['en-body-451-t3', 'en-body-linewidths-3x200'],
  ['en-body-451-left', 'en-body-451-right'],
  ['en-body-451-left', 'en-body-451-center'],
  ['en-body-451-tracking0', 'en-body-451-tracking1'],
  ['en-body-451-tracking1', 'en-body-451-tracking2'],
];

// ─── Export baseline (PDF and SVG) ───────────────────────────────────────────
//
// export.test.ts renders these through render-pdf and render-core's SVG
// renderer and compares a summary of each file with
// tests/golden/snapshots/pdf/<id>.json and snapshots/svg/<id>.json. The
// layout snapshots above cannot see the export stage: v0.7.0 wrote CMYK fills
// at 1 % strength and every layout snapshot stayed the same.
//
// Each export case sets one or more of the paragraph cases above. `check` is
// what a person looks for when opening the file
// (`npm run golden:preview` writes the files to tests/golden/outputs/export/).

export interface ExportCase {
  /** File-name-safe identifier; also the snapshot file name. */
  id: string;
  /** Ids of cases in CASES, set in this order. */
  from: string[];
  /** What to look for when opening the exported file. */
  check: string;
  /** Glyph fill colour as CSS (render-pdf `fill`); default black. */
  fill?: string;
  /**
   * Render the fill through a CMYK colour transform, with a CMYK
   * OutputIntent and PDF/X-3 markers.
   */
  cmyk?: boolean;
  /**
   * Set the paragraphs as a document flowing through frames of this height,
   * one frame per page, instead of as one paragraph on one page.
   */
  frameHeight?: number;
}

export const EXPORT_CASES: ExportCase[] = [
  {
    id: 'rgb-en-body',
    from: ['en-body-451-t3'],
    fill: '#cc3300',
    check:
      'Orange-red text (RGB 0.8 0.2 0); 11 justified lines on one A4 page.',
  },
  {
    id: 'cmyk-pdfx-en-body',
    from: ['en-body-451-t3'],
    cmyk: true,
    check:
      'Solid black: Acrobat Output Preview shows 100 % Black and 0 % C, M, Y; ' +
      'OutputIntent GTS_PDFX "FOGRA39"; Info GTS_PDFXVersion PDF/X-3:2003.',
  },
  {
    id: 'de-compounds-w200',
    from: ['de-compounds-w200'],
    check:
      'German compound nouns hyphenated in a 200 pt column, no line sticks out.',
  },
  {
    id: 'arabic-451-t3',
    from: ['arabic-451-t3'],
    check: 'Arabic set right to left, letters joined, lines flush right.',
  },
  {
    id: 'hebrew-451-t3',
    from: ['hebrew-451-t3'],
    check: 'Hebrew set right to left, lines flush right.',
  },
  {
    id: 'wide-url-w200',
    from: ['wide-url-w200'],
    check:
      'The URLs break after "/" or "?" or before "." with no hyphen added.',
  },
  {
    id: 'spans-mixed-font',
    from: ['spans-mixed-font'],
    check: 'Regular, bold and italic in one paragraph; three fonts embedded.',
  },
  {
    id: 'multi-page',
    from: ['en-body-451-t3', 'de-compounds-w200', 'en-narrow-w200'],
    frameHeight: 160,
    check:
      'Three paragraphs flowing over 3 pages, each page holding a 160 pt ' +
      'frame; no line lost or repeated between pages.',
  },
];
