// nodes.ts

import {
  Node,
  Box,
  Glue,
  Penalty,
  Font,
  SpanSegment,
  FORCED_BREAK,
  HYPHEN_PENALTY,
  SOFT_HYPHEN_PENALTY,
} from './types';
import { HyphenatedWord } from './hyphenate';
import { Measurer } from './measure';

// ─── Extended input type ──────────────────────────────────────────────────────

export interface HyphenatedWordWithFont extends HyphenatedWord {
  font: Font; // dominant (first) font — used for single-font words and as fallback
  segments?: SpanSegment[][]; // per-fragment span breakdown; present for multi-font words
}

// ─── Builders ────────────────────────────────────────────────────────────────

const buildBox = (content: string, font: Font, measurer: Measurer, verticalOffset?: number): Box => ({
  type: 'box',
  content,
  font,
  width: measurer.measure(content, font),
  verticalOffset,
});

const buildIndentBox = (width: number, font: Font): Box => ({
  type: 'box',
  content: '',
  font,
  width,
});

const buildGlue = (font: Font, measurer: Measurer): Glue => {
  const { width, stretch, shrink } = measurer.space(font);
  return { type: 'glue', kind: 'word', width, stretch, shrink, font };
};

// penalty value varies: SOFT_HYPHEN_PENALTY for user-specified breaks,
// HYPHEN_PENALTY for algorithmic breaks
const buildHyphenPenalty = (
  font: Font,
  measurer: Measurer,
  penaltyValue: number = HYPHEN_PENALTY,
): Penalty => ({
  type: 'penalty',
  width: measurer.measure('-', font),
  penalty: penaltyValue,
  flagged: true,
});

// ─── Paragraph termination ────────────────────────────────────────────────────

const buildTermination = (): Node[] => [
  {
    type: 'glue',
    kind: 'termination', // explicit
    width: 0,
    stretch: Infinity,
    shrink: 0,
  },
  {
    type: 'penalty',
    width: 0,
    penalty: FORCED_BREAK,
    flagged: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns the font to use for inter-word glue: last segment font when segments
// are present, otherwise the word's single font.
const glueFont = (word: HyphenatedWordWithFont): Font => {
  if (word.segments && word.segments.length > 0) {
    const lastFrag = word.segments[word.segments.length - 1];
    if (lastFrag.length > 0) return lastFrag[lastFrag.length - 1].font;
  }
  return word.font;
};

// ─── Core ─────────────────────────────────────────────────────────────────────

export const buildNodeSequence = (
  words: HyphenatedWordWithFont[],
  measurer: Measurer,
  firstLineIndent: number = 0,
): Node[] => {
  const nodes: Node[] = [];

  if (firstLineIndent > 0) {
    const firstFont = words[0]?.font;
    if (firstFont) nodes.push(buildIndentBox(firstLineIndent, firstFont));
  }

  words.forEach((word, index) => {
    const { fragments, font, hasSoftHyphen, segments } = word;

    // soft hyphen words use SOFT_HYPHEN_PENALTY — preferred over algorithmic
    const penaltyValue = hasSoftHyphen ? SOFT_HYPHEN_PENALTY : HYPHEN_PENALTY;

    if (segments) {
      // multi-span word — emit one Box per segment per fragment, threading verticalOffset
      segments.forEach((fragSegs, fi) => {
        fragSegs.forEach((seg) => {
          nodes.push(buildBox(seg.text, seg.font, measurer, seg.verticalOffset));
        });
        if (fi < segments.length - 1) {
          // hyphen penalty uses the last segment's font of this fragment
          const lastSeg = fragSegs[fragSegs.length - 1];
          nodes.push(buildHyphenPenalty(lastSeg.font, measurer, penaltyValue));
        }
      });
    } else if (fragments.length === 1) {
      nodes.push(buildBox(fragments[0], font, measurer));
    } else {
      fragments.forEach((fragment, fi) => {
        nodes.push(buildBox(fragment, font, measurer));
        if (fi < fragments.length - 1) {
          nodes.push(buildHyphenPenalty(font, measurer, penaltyValue));
        }
      });
    }

    if (index < words.length - 1) {
      nodes.push(buildGlue(glueFont(word), measurer));
    }
  });

  nodes.push(...buildTermination());

  return nodes;
};
