import { BreakpointNode } from '@paragraf/types';

// ─── Types ───────────────────────────────────────────────────────────────────

// A single resolved line break — position in node sequence + its r value
export interface LineBreak {
  position: number; // index in node sequence where line ends
  ratio: number; // r value — how much glue was stretched/shrunk on this line
  flagged: boolean; // true if line ends with a hyphen
  line: number; // line number (1-based)
}

// ─── Core ────────────────────────────────────────────────────────────────────

// Follow previous pointers from the final best node back to startNode
// Collect in reverse, then reverse to get correct order
export const traceback = (finalNode: BreakpointNode): LineBreak[] => {
  const breaks: LineBreak[] = [];

  let current: BreakpointNode | null = finalNode;

  while (current !== null && current.previous !== null) {
    breaks.push({
      position: current.position,
      ratio: current.ratio,
      flagged: current.flagged,
      line: current.line,
    });
    current = current.previous;
  }

  // collected in reverse order (final → start), restore correct order
  return breaks.reverse();
};
