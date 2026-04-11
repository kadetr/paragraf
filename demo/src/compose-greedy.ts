// demo/src/compose-greedy.ts
// First-fit greedy word-wrap — reference algorithm for the demo comparison.
// Returns ComposedParagraph (same type as composeKP) so the shared renderer works.

import type {
  Font,
  ComposedParagraph,
  ComposedLine,
  FontRegistry,
  AlignmentMode,
} from '@paragraf/compile';
import { createBrowserMeasurer } from './measurer.js';

export function composeGreedy(
  text: string,
  font: Font,
  lineWidth: number,
  registry: FontRegistry,
  alignment: AlignmentMode = 'left',
): ComposedParagraph {
  const measurer = createBrowserMeasurer(registry);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const fontMetrics = measurer.metrics(font);
  const spaceMetrics = measurer.space(font);
  const lineHeight =
    fontMetrics.ascender - fontMetrics.descender + fontMetrics.lineGap;
  const baseline = fontMetrics.ascender; // relative to line top

  // Greedily pack words into lines
  const lines: ComposedLine[] = [];
  let lineWords: string[] = [];
  let usedWidth = 0; // sum of word widths + natural spaces so far

  for (const word of words) {
    const wordWidth = measurer.measure(word, font);

    if (lineWords.length === 0) {
      lineWords.push(word);
      usedWidth = wordWidth;
    } else {
      const needed = usedWidth + spaceMetrics.width + wordWidth;
      if (needed <= lineWidth) {
        lineWords.push(word);
        usedWidth = needed;
      } else {
        lines.push(
          buildLine(
            lineWords,
            font,
            lineWidth,
            usedWidth,
            lineHeight,
            baseline,
            false,
            spaceMetrics.width,
            alignment,
          ),
        );
        lineWords = [word];
        usedWidth = wordWidth;
      }
    }
  }

  // Flush last line — use natural spacing, don't stretch to fill
  if (lineWords.length > 0) {
    lines.push(
      buildLine(
        lineWords,
        font,
        lineWidth,
        usedWidth,
        lineHeight,
        baseline,
        true,
        spaceMetrics.width,
        alignment,
      ),
    );
  }

  return lines;
}

function buildLine(
  words: string[],
  font: Font,
  lineWidth: number,
  usedWidth: number, // = sum(wordWidths) + (n-1)*naturalSpaceWidth
  lineHeight: number,
  baseline: number,
  isLastLine: boolean,
  naturalSpaceWidth: number,
  alignment: AlignmentMode,
): ComposedLine {
  const numGaps = words.length - 1;
  // usedWidth already includes natural spaces; subtract them to get pure word content width
  const wordContentWidth = usedWidth - numGaps * naturalSpaceWidth;
  const remaining = lineWidth - wordContentWidth;
  // Only justify non-last lines when alignment is 'justified'
  const justify = alignment === 'justified' && !isLastLine && numGaps > 0;
  const wordSpacing = justify ? remaining / numGaps : naturalSpaceWidth;
  // Last line of justified text and non-justified modes both use the declared alignment
  const lineAlignment: AlignmentMode =
    alignment === 'justified' && !isLastLine
      ? 'justified'
      : alignment === 'justified'
        ? 'left'
        : alignment;

  return {
    words,
    fonts: words.map(() => font),
    wordRuns: words.map((w) => [{ text: w, font }]),
    wordSpacing,
    hyphenated: false,
    ratio: 0,
    alignment: lineAlignment,
    isWidow: false,
    lineWidth,
    lineHeight,
    baseline,
  };
}
