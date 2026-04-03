// compose.ts

import {
  Node,
  Glue,
  Font,
  AlignmentMode,
  ComposedLine,
  ComposedParagraph,
  SpanSegment,
  GetFontMetrics,
} from '@paragraf/types';
import { LineBreak } from './traceback.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const resolveGlueWidth = (
  glue: Glue,
  ratio: number,
  alignment: AlignmentMode,
): number => {
  if (alignment !== 'justified') return glue.width;
  if (ratio >= 0) return glue.width + ratio * glue.stretch;
  return glue.width + ratio * glue.shrink;
};

// ─── Last line ratio ──────────────────────────────────────────────────────────

const computeLastLineRatio = (
  nodes: Node[],
  from: number,
  to: number,
  lineWidth: number,
): number => {
  let contentWidth = 0;
  let totalStretch = 0;
  let totalShrink = 0;
  let glueCount = 0;

  const start = from === 0 ? 0 : from + 1;

  for (let i = start; i <= to; i++) {
    const node = nodes[i];
    if (node.type === 'box') {
      contentWidth += node.width;
    } else if (node.type === 'glue' && node.kind === 'word') {
      contentWidth += node.width;
      totalStretch += node.stretch;
      totalShrink += node.shrink;
      glueCount++;
    }
  }

  if (glueCount === 0) return 0;

  const remaining = lineWidth - contentWidth;

  if (remaining > 0) return totalStretch > 0 ? remaining / totalStretch : 0;
  if (remaining < 0) return totalShrink > 0 ? remaining / totalShrink : 0;
  return 0;
};

// ─── Line extraction ──────────────────────────────────────────────────────────

const extractLine = (
  nodes: Node[],
  from: number,
  to: number,
  ratio: number,
  flagged: boolean,
  alignment: AlignmentMode,
  isLastLine: boolean,
  justifyLastLine: boolean,
  lineWidth: number,
  getMetrics?: GetFontMetrics,
): ComposedLine => {
  const words: string[] = [];
  const fonts: Font[] = [];
  const wordRuns: SpanSegment[][] = [];
  let wordSpacing = 0;
  let spacingResolved = false;
  let lastWasHyphenPenalty = false;
  let lastWasBox = false; // true when last node was a box — indicates span continuation within the same word
  // Invariant: buildNodeSequence guarantees a glue node between every two words, so
  // consecutive boxes are always span fragments of the same word, never adjacent words.
  // If nodes.ts breaks this contract, word slots will silently merge across boundaries.

  const effectiveRatio =
    isLastLine && justifyLastLine
      ? computeLastLineRatio(nodes, from, to, lineWidth)
      : ratio;

  const start = from === 0 ? 0 : from + 1;

  for (let i = start; i <= to; i++) {
    const node = nodes[i];

    if (node.type === 'box') {
      if ((lastWasHyphenPenalty || lastWasBox) && words.length > 0) {
        // hyphen fragment continuation or span continuation within same word
        words[words.length - 1] += node.content;
        wordRuns[wordRuns.length - 1].push({
          text: node.content,
          font: node.font,
          verticalOffset: node.verticalOffset,
        });
      } else {
        // new word entry
        words.push(node.content);
        fonts.push(node.font);
        wordRuns.push([
          {
            text: node.content,
            font: node.font,
            verticalOffset: node.verticalOffset,
          },
        ]);
      }
      lastWasHyphenPenalty = false;
      lastWasBox = true;
    } else if (node.type === 'penalty' && node.flagged) {
      lastWasHyphenPenalty = i < to;
      lastWasBox = false;
    } else {
      lastWasHyphenPenalty = false;
      lastWasBox = false;
    }

    // NOTE: word spacing is resolved from the first word glue on the line.
    // For single-font paragraphs this is exact.
    // For mixed-font paragraphs, glues from different fonts have different
    // natural widths and stretch budgets — this is an approximation.
    if (node.type === 'glue' && node.kind === 'word' && !spacingResolved) {
      wordSpacing = resolveGlueWidth(node, effectiveRatio, alignment);
      spacingResolved = true;
    }
  }

  if (flagged && words.length > 0) {
    words[words.length - 1] += '-';
    // append hyphen to the last segment of the last word's runs too
    const lastRuns = wordRuns[wordRuns.length - 1];
    if (lastRuns.length > 0) {
      const last = lastRuns[lastRuns.length - 1];
      lastRuns[lastRuns.length - 1] = { ...last, text: last.text + '-' };
    }
  }

  // line height and baseline from max metrics across all fonts on the line.
  // Using the first font alone causes mixed-font lines (e.g. inline heading text)
  // to have insufficient lineHeight, clipping large glyphs into the line above.
  let lineHeight = 0;
  let baseline = 0;
  if (getMetrics) {
    // collect every segment font (not just first-font-per-word)
    const seen = new Set<Font>();
    for (const runs of wordRuns) {
      for (const seg of runs) {
        if (!seen.has(seg.font)) {
          seen.add(seg.font);
          const m = getMetrics(seg.font);
          if (m) {
            const lh = m.ascender - m.descender + m.lineGap;
            if (lh > lineHeight) lineHeight = lh;
            if (m.ascender > baseline) baseline = m.ascender;
          }
        }
      }
    }
  }

  return {
    words,
    fonts,
    wordRuns,
    wordSpacing,
    hyphenated: flagged,
    ratio: effectiveRatio,
    alignment,
    isWidow: false, // set by composeParagraph post-pass
    lineWidth,
    lineHeight,
    baseline,
  };
};

// ─── Core ─────────────────────────────────────────────────────────────────────

export const composeParagraph = (
  nodes: Node[],
  breaks: LineBreak[],
  alignment: AlignmentMode = 'justified',
  justifyLastLine: boolean = false,
  lineWidth: number = 0,
  lineWidths: number[] = [],
  getMetrics?: GetFontMetrics,
  direction: 'ltr' | 'rtl' = 'ltr',
): ComposedParagraph => {
  if (justifyLastLine && lineWidth === 0) {
    throw new Error(
      'lineWidth must be provided when justifyLastLine=true. ' +
        'Pass the same lineWidth used for composition.',
    );
  }

  const lines: ComposedLine[] = [];
  let previousPosition = 0;

  for (let bi = 0; bi < breaks.length; bi++) {
    const lineBreak = breaks[bi];
    const isLastLine = bi === breaks.length - 1;
    const effectiveWidth = lineWidths[bi] ?? lineWidth;

    const line = extractLine(
      nodes,
      previousPosition,
      lineBreak.position,
      lineBreak.ratio,
      lineBreak.flagged,
      alignment,
      isLastLine,
      justifyLastLine,
      effectiveWidth,
      getMetrics,
    );

    if (line.words.length > 0) lines.push({ ...line, direction });
    previousPosition = lineBreak.position;
  }

  // mark widow — last line with single non-empty content word
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    const contentWords = last.words.filter((w) => w !== '');
    if (contentWords.length === 1) {
      lines[lines.length - 1] = { ...last, isWidow: true };
    }
  }

  return lines;
};
