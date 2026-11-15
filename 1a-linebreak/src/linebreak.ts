// linebreak.ts

import {
  Node,
  Box,
  BreakpointNode,
  Paragraph,
  DOUBLE_HYPHEN_PENALTY,
  isForced,
  isProhibited,
} from '@paragraf/types';

// ─── Prefix sums ─────────────────────────────────────────────────────────────

interface PrefixSums {
  widths: number[];
  stretches: number[];
  shrinks: number[];
}

const buildPrefixSums = (nodes: Node[]): PrefixSums => {
  const len = nodes.length + 1;
  const widths = new Array(len).fill(0);
  const stretches = new Array(len).fill(0);
  const shrinks = new Array(len).fill(0);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    widths[i + 1] = widths[i];
    stretches[i + 1] = stretches[i];
    shrinks[i + 1] = shrinks[i];

    if (node.type === 'box') {
      widths[i + 1] += node.width;
    } else if (node.type === 'glue') {
      widths[i + 1] += node.width;
      stretches[i + 1] += node.stretch;
      shrinks[i + 1] += node.shrink;
    }
  }

  return { widths, stretches, shrinks };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isFeasible = (ratio: number, tolerance: number): boolean =>
  ratio >= -1 && ratio <= tolerance;

const computeBadness = (ratio: number): number =>
  Math.min(10000, Math.round(100 * Math.pow(Math.abs(ratio), 3)));

/**
 * Maps an adjustment ratio to one of TeX's four fitness classes:
 *   0 = tight      (r < −0.5)
 *   1 = normal     (−0.5 ≤ r ≤ 0.5)
 *   2 = loose      (0.5 < r ≤ 1.0)
 *   3 = very loose (r > 1.0)
 */
const fitnessClassOf = (ratio: number): 0 | 1 | 2 | 3 => {
  if (ratio < -0.5) return 0;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1.0) return 2;
  return 3;
};

const computeDemerits = (
  badness: number,
  penalty: number,
  prevFlagged: boolean,
  currFlagged: boolean,
): number => {
  let demerits: number;

  if (penalty >= 0) {
    demerits = Math.pow(1 + badness + penalty, 2);
  } else if (!isForced(penalty)) {
    demerits = Math.pow(1 + badness, 2) - Math.pow(penalty, 2);
  } else {
    demerits = Math.pow(1 + badness, 2);
  }

  if (prevFlagged && currFlagged) demerits += DOUBLE_HYPHEN_PENALTY;

  return demerits;
};

// ─── Break point validity ─────────────────────────────────────────────────────

const isValidBreak = (nodes: Node[], index: number): boolean => {
  const node = nodes[index];
  if (node.type === 'penalty') return !isProhibited(node.penalty);
  if (node.type === 'glue') {
    if (index > 0 && nodes[index - 1].type === 'box') return true;
  }
  return false;
};

// ─── Ratio computation ────────────────────────────────────────────────────────

const computeRatio = (
  lineWidth: number,
  penaltyWidth: number,
  sumWidth: number,
  sumStretch: number,
  sumShrink: number,
  emergencyStretch: number = 0,
): number => {
  const target = lineWidth - sumWidth - penaltyWidth;
  if (target > 0) {
    const totalStretch = sumStretch + emergencyStretch;
    return totalStretch > 0 ? target / totalStretch : Infinity;
  }
  if (target < 0) return sumShrink > 0 ? target / sumShrink : -Infinity;
  return 0;
};

// ─── Line start ───────────────────────────────────────────────────────────────

/**
 * Index of the first node of the line that follows a break at `breakPosition`
 * and ends at `to`.
 *
 * The node that was broken at belongs to neither line, and the glue and
 * optional penalties that follow it are discarded, exactly as TeX discards
 * them after a line break. The next line therefore starts at the first box,
 * or at a forced break (which then produces an empty line).
 *
 * Position 0 is the start of the paragraph, where nothing is discarded.
 *
 * Exported so that composeParagraph extracts exactly the nodes the breaker
 * measured.
 */
export const lineStartAfter = (
  nodes: Node[],
  breakPosition: number,
  to: number,
): number => {
  if (breakPosition === 0) return 0;
  let start = breakPosition + 1;
  while (start < to) {
    const node = nodes[start];
    if (node.type === 'box') break;
    if (node.type === 'penalty' && isForced(node.penalty)) break;
    start++;
  }
  return Math.min(start, to);
};

/**
 * lineStart[p] for every p: the first box or forced break after node p
 * (nodes.length if there is none). Computed once so the forward pass can look
 * up a line's start in O(1).
 */
const buildLineStarts = (nodes: Node[]): number[] => {
  const starts = new Array<number>(nodes.length + 1);
  let next = nodes.length;
  starts[nodes.length] = next;
  for (let i = nodes.length - 1; i >= 0; i--) {
    starts[i] = next; // first line-starting node strictly after i
    const node = nodes[i];
    if (
      node.type === 'box' ||
      (node.type === 'penalty' && isForced(node.penalty))
    ) {
      next = i;
    }
  }
  starts[0] = 0; // paragraph start: nothing is discarded
  return starts;
};

// ─── Widow detection ──────────────────────────────────────────────────────────

const countContentBoxes = (nodes: Node[], from: number, to: number): number => {
  let count = 0;
  const start = lineStartAfter(nodes, from, to);
  for (let i = start; i <= to; i++) {
    const node = nodes[i];
    if (node.type === 'box' && (node as Box).content !== '') count++;
  }
  return count;
};

// ─── Forward pass ─────────────────────────────────────────────────────────────

const forwardPass = (
  nodes: Node[],
  lineWidth: number,
  tolerance: number,
  sums: PrefixSums,
  lineStarts: number[],
  emergencyStretch: number = 0,
  consecutiveHyphenLimit: number = 0,
  runtPenalty: number = 0,
  singleLinePenalty: number = 0,
  lineWidths: number[] = [],
  adjDemerits: number = 0,
): BreakpointNode[] => {
  const startNode: BreakpointNode = {
    position: 0,
    line: 0,
    totalDemerits: 0,
    ratio: 0,
    previous: null,
    flagged: false,
    consecutiveHyphens: 0,
    fitnessClass: 1, // initial node is treated as normal (ratio 0)
  };

  let active: BreakpointNode[] = [startNode];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isValidBreak(nodes, i)) continue;

    const penaltyWidth = node.type === 'penalty' ? node.width : 0;
    const penaltyValue = node.type === 'penalty' ? node.penalty : 0;
    const isFlagged = node.type === 'penalty' ? node.flagged : false;
    const isForcedBreak = isForced(penaltyValue);

    const nextActive: BreakpointNode[] = [];
    // Best candidate ending at i, per line number — and per fitness class when
    // adjacent-line demerits are in use. With adjDemerits > 0 the cost of the
    // *next* line depends on this line's fitness class, so a candidate with
    // more demerits but a different class can still lead to the optimum and
    // must be kept (Knuth & Plass 1981, §4; TeX keeps one active node per
    // line number and fitness class). With adjDemerits = 0 the class cannot
    // affect later costs, so one candidate per line number is enough.
    const bestAtI = new Map<number, BreakpointNode>();

    for (const a of active) {
      // resolve effective lineWidth for this candidate line
      // a.line is the line number of the previous break
      // this candidate would produce line a.line + 1 (1-based)
      // lineWidths is 0-indexed so lineWidths[a.line] is the width for line a.line+1
      const effectiveLineWidth = lineWidths[a.line] ?? lineWidth;

      // The line starts at the first box after the previous break, not at
      // the break itself: the glue that was broken at is not part of it.
      const start = Math.min(lineStarts[a.position], i);
      const sumWidth = sums.widths[i] - sums.widths[start];
      const sumStretch = sums.stretches[i] - sums.stretches[start];
      const sumShrink = sums.shrinks[i] - sums.shrinks[start];

      const ratio = computeRatio(
        effectiveLineWidth,
        penaltyWidth,
        sumWidth,
        sumStretch,
        sumShrink,
        emergencyStretch,
      );

      if (ratio >= -1 && !isForcedBreak) nextActive.push(a);

      if (isFeasible(ratio, tolerance)) {
        const consecutiveHyphens = isFlagged ? a.consecutiveHyphens + 1 : 0;

        if (
          consecutiveHyphenLimit > 0 &&
          consecutiveHyphens > consecutiveHyphenLimit
        ) {
          continue;
        }

        const badness = computeBadness(ratio);
        let demerits = computeDemerits(
          badness,
          penaltyValue,
          a.flagged,
          isFlagged,
        );

        if (adjDemerits > 0) {
          const fc = fitnessClassOf(ratio);
          if (Math.abs(fc - a.fitnessClass) > 1) demerits += adjDemerits;
        }

        if (isForcedBreak && runtPenalty > 0) {
          const lastLineBoxes = countContentBoxes(nodes, a.position, i);
          if (lastLineBoxes === 1) demerits += runtPenalty;
        }

        if (isForcedBreak && singleLinePenalty > 0 && a.previous === null) {
          demerits += singleLinePenalty;
        }

        const candidate: BreakpointNode = {
          position: i,
          line: a.line + 1,
          totalDemerits: a.totalDemerits + demerits,
          ratio,
          previous: a,
          flagged: isFlagged,
          consecutiveHyphens,
          fitnessClass: fitnessClassOf(ratio),
        };

        const key =
          adjDemerits > 0
            ? candidate.line * 4 + candidate.fitnessClass
            : candidate.line * 4;
        const existing = bestAtI.get(key);
        if (!existing || candidate.totalDemerits < existing.totalDemerits) {
          bestAtI.set(key, candidate);
        }
      }
    }

    // Ascending key order, so that ties are resolved the same way here and
    // in the Rust port.
    for (const key of [...bestAtI.keys()].sort((x, y) => x - y)) {
      nextActive.push(bestAtI.get(key)!);
    }

    active = nextActive;
  }

  return active;
};

// ─── Result type ─────────────────────────────────────────────────────────────

export interface BreakpointResult {
  node: BreakpointNode;
  usedEmergency: boolean;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

export const computeBreakpoints = (paragraph: Paragraph): BreakpointResult => {
  const {
    nodes,
    lineWidth,
    lineWidths = [],
    tolerance,
    emergencyStretch = 0,
    consecutiveHyphenLimit = 0,
    looseness = 0,
  } = paragraph;

  const runtPenalty = paragraph.runtPenalty ?? 0;
  const singleLinePenalty = paragraph.singleLinePenalty ?? 0;
  const adjDemerits = paragraph.adjDemerits ?? 0;

  const sums = buildPrefixSums(nodes);
  const lineStarts = buildLineStarts(nodes);

  let active = forwardPass(
    nodes,
    lineWidth,
    tolerance,
    sums,
    lineStarts,
    0,
    consecutiveHyphenLimit,
    runtPenalty,
    singleLinePenalty,
    lineWidths,
    adjDemerits,
  );

  let usedEmergency = false;

  if (active.length === 0) {
    if (emergencyStretch > 0) {
      active = forwardPass(
        nodes,
        lineWidth,
        tolerance,
        sums,
        lineStarts,
        emergencyStretch,
        consecutiveHyphenLimit,
        runtPenalty,
        singleLinePenalty,
        lineWidths,
        adjDemerits,
      );
      usedEmergency = true;
    }

    if (active.length === 0) {
      throw new Error(
        'Paragraph could not be set within tolerance. ' +
          'Consider increasing tolerance or adding emergencyStretch.',
      );
    }
  }

  const optimal = active.reduce((prev, curr) =>
    curr.totalDemerits < prev.totalDemerits ? curr : prev,
  );

  if (looseness === 0) return { node: optimal, usedEmergency };

  const targetLine = optimal.line + looseness;
  const candidates = active.filter((n) => n.line === targetLine);
  if (candidates.length === 0) return { node: optimal, usedEmergency };

  return {
    node: candidates.reduce((prev, curr) =>
      curr.totalDemerits < prev.totalDemerits ? curr : prev,
    ),
    usedEmergency,
  };
};
