// optical-margin.ts
//
// Optical Margin Alignment (OMA) — v0.10
//
// Protrusion table and two-pass recompose utilities.
// OMA allows punctuation at the start/end of a line to "hang" slightly into
// the margin, making the text block look visually flush.
//
// References: InDesign Optical Margin Alignment; Hàn Thế Thành's pdfTeX docs.

import { ComposedParagraph } from '@paragraf/types';
import { ParagraphInput } from './paragraph.js';

// ─── Protrusion table ─────────────────────────────────────────────────────────
//
// Values are fractions of font size.
// left  = fraction that hangs into the LEFT margin (applied as negative xOffset)
// right = fraction that hangs into the RIGHT margin (extends lineWidth)

export const PROTRUSION_TABLE: Map<string, { left: number; right: number }> =
  new Map([
    // Hyphens and dashes
    ['-', { left: 0.5, right: 0.5 }],
    ['\u2013', { left: 0.5, right: 0.5 }], // en dash –
    ['\u2014', { left: 0.5, right: 0.5 }], // em dash —

    // Sentence-ending punctuation (right-only protrusion)
    [',', { left: 0.0, right: 0.7 }],
    ['.', { left: 0.0, right: 0.7 }],
    [':', { left: 0.0, right: 0.5 }],
    [';', { left: 0.0, right: 0.5 }],

    // Curly quotes — open = left margin, close = right margin
    ['\u2018', { left: 0.7, right: 0.0 }], // ' open single
    ['\u2019', { left: 0.0, right: 0.7 }], // ' close single
    ['\u201C', { left: 0.7, right: 0.0 }], // " open double
    ['\u201D', { left: 0.0, right: 0.7 }], // " close double

    // Straight quotes (ambiguous direction; protrude both sides conservatively)
    ["'", { left: 0.7, right: 0.7 }],
    ['"', { left: 0.7, right: 0.7 }],

    // Brackets and parentheses
    ['(', { left: 0.3, right: 0.0 }],
    [')', { left: 0.0, right: 0.3 }],
    ['[', { left: 0.3, right: 0.0 }],
    [']', { left: 0.0, right: 0.3 }],

    // Asterisk
    ['*', { left: 0.3, right: 0.3 }],
  ]);

// ─── lookupProtrusion ─────────────────────────────────────────────────────────

/**
 * Return the protrusion fractions for a single character.
 * Returns `{ left: 0, right: 0 }` for unknown or empty input.
 */
export function lookupProtrusion(char: string): {
  left: number;
  right: number;
} {
  if (!char) return { left: 0, right: 0 };
  return PROTRUSION_TABLE.get(char) ?? { left: 0, right: 0 };
}

// ─── buildOmaAdjustments ─────────────────────────────────────────────────────

/**
 * Compute per-line width extensions and x-offsets for optical margin alignment.
 *
 * For each line:
 *   - Inspect the first character of the first word → left protrusion, scaled by first word's font size
 *   - Inspect the last character of the last word → right protrusion, scaled by last word's font size
 *
 * Returns:
 *   lineWidths[i] = baseWidth + leftProt + rightProt
 *   xOffsets[i]   = -leftProt   (shift line left so char hangs into margin)
 */
export function buildOmaAdjustments(
  lines: ComposedParagraph,
  baseWidth: number,
): { lineWidths: number[]; xOffsets: number[] } {
  const lineWidths: number[] = [];
  const xOffsets: number[] = [];

  for (const line of lines) {
    if (line.words.length === 0 || line.fonts.length === 0) {
      lineWidths.push(baseWidth);
      xOffsets.push(0);
      continue;
    }

    // Scale each protrusion by the font size of the word at that margin.
    const leftFontSize = line.fonts[0].size;
    const rightFontSize = line.fonts[line.fonts.length - 1].size;

    // First character of the first word
    const firstWord = line.words[0] ?? '';
    const firstChar = firstWord[0] ?? '';
    const leftFraction = lookupProtrusion(firstChar).left;
    const leftProt = leftFraction * leftFontSize;

    // Last character of the last word
    const lastWord = line.words[line.words.length - 1] ?? '';
    const lastChar = lastWord[lastWord.length - 1] ?? '';
    const rightFraction = lookupProtrusion(lastChar).right;
    const rightProt = rightFraction * rightFontSize;

    lineWidths.push(baseWidth + leftProt + rightProt);
    xOffsets.push(-leftProt);
  }

  return { lineWidths, xOffsets };
}

// ─── buildOmaInput ────────────────────────────────────────────────────────────

/**
 * Produce a modified `ParagraphInput` for the second Knuth-Plass pass:
 *   - Sets `lineWidths` to the OMA-adjusted widths (wider where chars protrude)
 *   - Clears `opticalMarginAlignment` to `false` so the second pass does NOT
 *     recurse into a third pass
 *   - Preserves all other fields verbatim
 *
 * The returned `xOffsets` are NOT stored in ParagraphInput — they are applied
 * to `ComposedLine.xOffset` after the second pass by `compose()` in paragraph.ts.
 */
export function buildOmaInput(
  input: ParagraphInput,
  firstPassLines: ComposedParagraph,
): ParagraphInput {
  const baseWidth = input.lineWidth;
  const { lineWidths } = buildOmaAdjustments(firstPassLines, baseWidth);
  return {
    ...input,
    lineWidths,
    opticalMarginAlignment: false,
  };
}
