/**
 * Manual WASM demo — run with: npx tsx scripts/wasm-demo.ts
 *
 * Tests all implemented phases interactively without vitest.
 * Useful for quick manual verification after a build.
 */

import { createRequire } from 'module';
import { computeBreakpoints } from '../src/linebreak.js';
import { traceback } from '../src/traceback.js';
import { FORCED_BREAK, PROHIBITED } from '../src/types.js';

const require = createRequire(import.meta.url);
const wasm: any = require('../wasm/pkg/knuth_plass_wasm.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

const WASM_FORCED_BREAK = -1e30;
const WASM_PROHIBITED = 1e30;

/** Serialize a Paragraph for WASM: replace ±Infinity with finite sentinels */
function toWasmJson(para: object): string {
  return JSON.stringify(para, (_key, val) => {
    if (val === -Infinity) return WASM_FORCED_BREAK;
    if (val === Infinity) return WASM_PROHIBITED;
    return val;
  });
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(` ${title}`);
  console.log('─'.repeat(60));
}

function pass(msg: string) {
  console.log(`  ✓  ${msg}`);
}
function fail(msg: string) {
  console.log(`  ✗  ${msg}`);
}
function info(msg: string) {
  console.log(`     ${msg}`);
}

// ─── Phase 0 — hello ─────────────────────────────────────────────────────────

section('Phase 0 — Hello from Rust');
const greeting = wasm.hello('PaCo');
info(`hello('PaCo') → "${greeting}"`);
greeting === 'hello from Rust, PaCo'
  ? pass('greeting correct')
  : fail('unexpected greeting');

// ─── Phase 1 — round-trip ────────────────────────────────────────────────────

section('Phase 1 — Node round-trip');

const box = {
  type: 'box',
  width: 10.5,
  content: 'hello',
  font: {
    id: 'serif',
    size: 12,
    weight: 400,
    style: 'normal',
    stretch: 'normal',
  },
};
const rtBox = JSON.parse(wasm.round_trip_node(JSON.stringify(box)));
JSON.stringify(rtBox) === JSON.stringify(box)
  ? pass('Box round-trip identical')
  : fail(`Box mismatch: ${JSON.stringify(rtBox)}`);

const glue = { type: 'glue', kind: 'word', width: 4, stretch: 2, shrink: 1 };
const rtGlue = JSON.parse(wasm.round_trip_node(JSON.stringify(glue)));
JSON.stringify(rtGlue) === JSON.stringify(glue)
  ? pass('Glue round-trip identical')
  : fail(`Glue mismatch: ${JSON.stringify(rtGlue)}`);

const penalty = { type: 'penalty', width: 0, penalty: -1e30, flagged: false };
const rtPenalty = JSON.parse(wasm.round_trip_node(JSON.stringify(penalty)));
rtPenalty.penalty === -1e30
  ? pass('Penalty finite sentinel round-trip identical')
  : fail(`Penalty mismatch: ${JSON.stringify(rtPenalty)}`);

// ─── Phase 2 — forward pass equivalence ──────────────────────────────────────

section('Phase 2 — Forward pass (TypeScript vs Rust)');

const FONT = {
  id: 'f',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const para = {
  nodes: [
    { type: 'box', width: 30, content: 'The', font: FONT },
    { type: 'glue', kind: 'word', width: 6, stretch: 8, shrink: 2 },
    { type: 'box', width: 25, content: 'quick', font: FONT },
    { type: 'glue', kind: 'word', width: 6, stretch: 8, shrink: 2 },
    { type: 'box', width: 35, content: 'brown', font: FONT },
    { type: 'glue', kind: 'word', width: 6, stretch: 8, shrink: 2 },
    { type: 'box', width: 20, content: 'fox', font: FONT },
    { type: 'glue', kind: 'termination', width: 0, stretch: 1e6, shrink: 0 },
    { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
  ],
  lineWidth: 80,
  tolerance: 3,
};

// TypeScript result
const tsResult = computeBreakpoints(para as any);
const tsOptimal = tsResult.node;

// Traceback to get positions
const tsPositions: number[] = [];
let cur: any = tsOptimal;
while (cur) {
  tsPositions.unshift(cur.position);
  cur = cur.previous;
}
info(`TypeScript break positions: [${tsPositions.join(', ')}]`);
info(`TypeScript total demerits:  ${tsOptimal.totalDemerits.toFixed(4)}`);
info(`TypeScript lines:           ${tsOptimal.line}`);

// Rust result
const wasmResult = JSON.parse(wasm.compute_breakpoints_wasm(toWasmJson(para)));
if ('error' in wasmResult) {
  fail(`Rust error: ${wasmResult.error}`);
} else {
  const { active, optimalIndex, usedEmergency } = wasmResult.ok;
  const rustOptimal = active[optimalIndex];
  info(`Rust break position:         ${rustOptimal.position}`);
  info(`Rust total demerits:         ${rustOptimal.totalDemerits.toFixed(4)}`);
  info(`Rust lines:                  ${rustOptimal.line}`);
  info(`Used emergency stretch:      ${usedEmergency}`);

  Math.abs(rustOptimal.totalDemerits - tsOptimal.totalDemerits) < 1e-6
    ? pass('totalDemerits match within 1e-6')
    : fail(
        `totalDemerits differ: TS=${tsOptimal.totalDemerits} Rust=${rustOptimal.totalDemerits}`,
      );

  rustOptimal.position === tsOptimal.position
    ? pass('optimal break position identical')
    : fail(
        `position differs: TS=${tsOptimal.position} Rust=${rustOptimal.position}`,
      );

  rustOptimal.line === tsOptimal.line
    ? pass('line count identical')
    : fail(`lines differ: TS=${tsOptimal.line} Rust=${rustOptimal.line}`);
}

// ─── Phase 3 — traceback equivalence ─────────────────────────────────────────

section('Phase 3 — Traceback (TypeScript vs Rust)');

const tsBreaks = traceback(computeBreakpoints(para as any).node);
info(`TypeScript breaks: ${JSON.stringify(tsBreaks.map((b) => ({ pos: b.position, line: b.line, ratio: +b.ratio.toFixed(4) })))}`);

const wasmTbResult = JSON.parse(wasm.traceback_wasm(toWasmJson(para)));
if ('error' in wasmTbResult) {
  fail(`Rust error: ${wasmTbResult.error}`);
} else {
  const rsBreaks: any[] = wasmTbResult.ok.breaks;
  info(`Rust breaks:       ${JSON.stringify(rsBreaks.map((b: any) => ({ pos: b.position, line: b.line, ratio: +b.ratio.toFixed(4) })))}`);

  rsBreaks.length === tsBreaks.length
    ? pass('break count identical')
    : fail(`count differs: TS=${tsBreaks.length} Rust=${rsBreaks.length}`);

  let allMatch = true;
  for (let i = 0; i < tsBreaks.length; i++) {
    if (rsBreaks[i].position !== tsBreaks[i].position) {
      fail(`break[${i}] position: TS=${tsBreaks[i].position} Rust=${rsBreaks[i].position}`);
      allMatch = false;
    }
    if (Math.abs(rsBreaks[i].ratio - tsBreaks[i].ratio) >= 1e-6) {
      fail(`break[${i}] ratio: TS=${tsBreaks[i].ratio} Rust=${rsBreaks[i].ratio}`);
      allMatch = false;
    }
    if (rsBreaks[i].flagged !== tsBreaks[i].flagged) {
      fail(`break[${i}] flagged: TS=${tsBreaks[i].flagged} Rust=${rsBreaks[i].flagged}`);
      allMatch = false;
    }
    if (rsBreaks[i].line !== tsBreaks[i].line) {
      fail(`break[${i}] line: TS=${tsBreaks[i].line} Rust=${rsBreaks[i].line}`);
      allMatch = false;
    }
  }
  if (allMatch) pass('all break fields match TypeScript within tolerance');
}

console.log('\n');
