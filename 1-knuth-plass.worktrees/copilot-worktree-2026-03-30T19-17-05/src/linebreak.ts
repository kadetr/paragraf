// linebreak.ts

import {
  Node,
  Box,
  BreakpointNode,
  Paragraph,
  FORCED_BREAK,
  PROHIBITED,
  DOUBLE_HYPHEN_PENALTY,
} from './types';

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
  Math.round(100 * Math.pow(Math.abs(ratio), 3));

const computeDemerits = (
  badness: number,
  penalty: number,
  prevFlagged: boolean,
  currFlagged: boolean,
): number => {
  let demerits: number;

  if (penalty >= 0) {
    demerits = Math.pow(1 + badness + penalty, 2);
  } else if (penalty !== FORCED_BREAK) {
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
  if (node.type === 'penalty') return node.penalty < PROHIBITED;
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

// ─── Widow detection ──────────────────────────────────────────────────────────

const countContentBoxes = (nodes: Node[], from: number, to: number): number => {
  let count = 0;
  const start = from === 0 ? 0 : from + 1;
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
  emergencyStretch: number = 0,
  consecutiveHyphenLimit: number = 0,
  widowPenalty: number = 0,
  orphanPenalty: number = 0,
  lineWidths: number[] = [],
): BreakpointNode[] => {
  const startNode: BreakpointNode = {
    position: 0,
    line: 0,
    totalDemerits: 0,
    ratio: 0,
    previous: null,
    flagged: false,
    consecutiveHyphens: 0,
  };

  let active: BreakpointNode[] = [startNode];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isValidBreak(nodes, i)) continue;

    const penaltyWidth = node.type === 'penalty' ? node.width : 0;
    const penaltyValue = node.type === 'penalty' ? node.penalty : 0;
    const isFlagged = node.type === 'penalty' ? node.flagged : false;
    const isForcedBreak = penaltyValue === FORCED_BREAK;

    const nextActive: BreakpointNode[] = [];
    const bestAtI = new Map<number, BreakpointNode>();

    for (const a of active) {
      // resolve effective lineWidth for this candidate line
      // a.line is the line number of the previous break
      // this candidate would produce line a.line + 1 (1-based)
      // lineWidths is 0-indexed so lineWidths[a.line] is the width for line a.line+1
      const effectiveLineWidth = lineWidths[a.line] ?? lineWidth;

      const sumWidth = sums.widths[i] - sums.widths[a.position];
      const sumStretch = sums.stretches[i] - sums.stretches[a.position];
      const sumShrink = sums.shrinks[i] - sums.shrinks[a.position];

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

        if (isForcedBreak && widowPenalty > 0) {
          const lastLineBoxes = countContentBoxes(nodes, a.position, i);
          if (lastLineBoxes === 1) demerits += widowPenalty;
        }

        if (isForcedBreak && orphanPenalty > 0 && a.previous === null) {
          demerits += orphanPenalty;
        }

        const candidate: BreakpointNode = {
          position: i,
          line: a.line + 1,
          totalDemerits: a.totalDemerits + demerits,
          ratio,
          previous: a,
          flagged: isFlagged,
          consecutiveHyphens,
        };

        const existing = bestAtI.get(candidate.line);
        if (!existing || candidate.totalDemerits < existing.totalDemerits) {
          bestAtI.set(candidate.line, candidate);
        }
      }
    }

    for (const winner of bestAtI.values()) {
      nextActive.push(winner);
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
    widowPenalty = 0,
    orphanPenalty = 0,
    looseness = 0,
  } = paragraph;

  const sums = buildPrefixSums(nodes);

  let active = forwardPass(
    nodes,
    lineWidth,
    tolerance,
    sums,
    0,
    consecutiveHyphenLimit,
    widowPenalty,
    orphanPenalty,
    lineWidths,
  );

  let usedEmergency = false;

  if (active.length === 0) {
    if (emergencyStretch > 0) {
      active = forwardPass(
        nodes,
        lineWidth,
        tolerance,
        sums,
        emergencyStretch,
        consecutiveHyphenLimit,
        widowPenalty,
        orphanPenalty,
        lineWidths,
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
