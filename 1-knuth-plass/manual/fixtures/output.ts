// manual/fixtures/output.ts
// Helpers for writing SVG, PDF, and metrics JSON to manual/outputs/.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUTS_DIR = path.resolve(__dirname, '../outputs');
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

export const outputPath = (filename: string): string =>
  path.join(OUTPUTS_DIR, filename);

export const writeSvg = (filename: string, svg: string): void => {
  const p = outputPath(filename);
  fs.writeFileSync(p, svg, 'utf8');
  console.log(`  SVG  → ${p}`);
};

export const writeJson = (filename: string, data: unknown): void => {
  const p = outputPath(filename);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  JSON → ${p}`);
};

export const writePdf = (filename: string, buf: Buffer): void => {
  const p = outputPath(filename);
  fs.writeFileSync(p, buf);
  console.log(`  PDF  → ${p}`);
};

// ─── Metrics schema ────────────────────────────────────────────────────────────

export interface LineMetrics {
  idx: number;
  y: number; // absolute baseline y
  ratio: number;
  hyphenated: boolean;
  xOffset: number;
  lineWidth: number;
  wordCount: number;
}

export interface TestMetrics {
  test: string;
  timestamp: string;
  perf: { composeMs: number; layoutMs?: number };
  lines: LineMetrics[];
  summary: {
    lineCount: number;
    usedEmergency: boolean;
    ratioVariance: number;
    maxRatio: number;
    minRatio: number;
    hyphenatedLines: number;
  };
  extra?: Record<string, unknown>;
}

/** Compute ratio variance across a set of lines (ignores last line = ratio 0). */
export const ratioVariance = (lines: LineMetrics[]): number => {
  const valid = lines.slice(0, -1); // exclude last line
  if (valid.length === 0) return 0;
  const mean = valid.reduce((s, l) => s + Math.abs(l.ratio), 0) / valid.length;
  const variance =
    valid.reduce((s, l) => s + (Math.abs(l.ratio) - mean) ** 2, 0) /
    valid.length;
  return Math.round(variance * 10000) / 10000;
};
