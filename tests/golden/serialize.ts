// tests/golden/serialize.ts
// Turns a composed paragraph into a stable, diff-friendly JSON document.
//
// Numbers are rounded so that harmless last-digit floating-point differences
// between machines do not show up as snapshot changes. Four decimals of a
// point is far below anything visible in print (1/720000 inch).

import type { ComposedLine } from '@paragraf/types';
import type { RenderedLine } from '@paragraf/render-core';

const DECIMALS = 4;

export const round = (n: number): number => {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** DECIMALS;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

export interface GoldenLine {
  text: string;
  hyphenated: boolean;
  ratio: number | string;
  wordSpacing: number;
  lineWidth: number;
  alignment: string;
  direction: string;
  isRunt: boolean;
  xOffset?: number;
  rightProtrusion?: number;
  /** Where the line lands on the page: baseline, then x and y per segment. */
  baseline: number;
  x: number[];
  y: number[];
}

export interface GoldenSnapshot {
  id: string;
  mirrors: string;
  engine: 'wasm' | 'ts';
  /** Set when composition threw; `lines` is then empty. */
  error?: string;
  lineCount: number;
  usedEmergency: boolean;
  lines: GoldenLine[];
}

// JSON cannot carry Infinity; the last line of a paragraph can have it.
const ratioValue = (r: number): number | string =>
  Number.isFinite(r) ? round(r) : String(r);

export const serializeLine = (
  line: ComposedLine,
  rendered: RenderedLine,
): GoldenLine => {
  const out: GoldenLine = {
    text: line.words.join(' '),
    hyphenated: line.hyphenated,
    ratio: ratioValue(line.ratio),
    wordSpacing: round(line.wordSpacing),
    lineWidth: round(line.lineWidth),
    alignment: line.alignment,
    direction: line.direction ?? 'ltr',
    isRunt: line.isRunt,
    baseline: round(rendered.baseline),
    x: rendered.segments.map((seg) => round(seg.x)),
    y: rendered.segments.map((seg) => round(seg.y)),
  };
  if (line.xOffset) out.xOffset = round(line.xOffset);
  if (line.rightProtrusion) out.rightProtrusion = round(line.rightProtrusion);
  return out;
};

// Pretty-printed, but with number arrays kept on one line so that a snapshot
// stays one screen per paragraph and a moved word is a one-line diff.
export const toJson = (snapshot: GoldenSnapshot): string =>
  JSON.stringify(snapshot, null, 2).replace(
    /\[\n\s+(-?[\d.]+(?:,\n\s+-?[\d.]+)*)\n\s+\]/g,
    (_m, body: string) => `[${body.replace(/,\n\s+/g, ', ')}]`,
  ) + '\n';
