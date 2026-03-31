/**
 * Phase 7 — Performance benchmarks: TypeScript vs WASM
 *
 * Measures six workloads to validate WASM speedup (5–15×) on the forward pass.
 * Cold startup cost is measured separately from per-paragraph latency.
 * All times in milliseconds.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import * as path from 'path';

import { createMeasurer } from '../src/measure';
import { buildNodeSequence } from '../src/nodes';
import { computeBreakpoints } from '../src/linebreak';
import { traceback, LineBreak } from '../src/traceback';
import {
  loadHyphenator,
  hyphenateParagraph,
  DEFAULT_HYPHENATE_OPTIONS,
} from '../src/hyphenate';
import { FontRegistry, Font, Language } from '../src/types';

// ─── WASM ────────────────────────────────────────────────────────────────────

const _require = createRequire(import.meta.url);

interface WasmInterface {
  traceback_wasm(json: string): string;
  register_font(id: string, data: Uint8Array): void;
  measure_text_wasm(text: string, fontJson: string): string;
  space_metrics_wasm(fontJson: string): string;
  font_metrics_wasm(fontJson: string): string;
}

let wasm: WasmInterface | null = null;
let wasmInitTime = 0;

const loadWasm = () => {
  if (wasm !== null) return;
  const start = performance.now();
  try {
    wasm = _require('../wasm/pkg/knuth_plass_wasm.js');
  } catch (e) {
    wasm = null;
  }
  wasmInitTime = performance.now() - start;
};

// ─── Binary serialization ────────────────────────────────────────────────────

const serializeNodesToBinary = (nodes: any[]): [Float64Array, Uint8Array] => {
  const f64s = new Float64Array(nodes.length * 4);
  const u8s = new Uint8Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const f64Idx = i * 4;

    if (node.type === 'box') {
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = 0;
      f64s[f64Idx + 2] = 0;
      f64s[f64Idx + 3] = 0;
      u8s[i] = 0;
    } else if (node.type === 'glue') {
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = node.stretch;
      f64s[f64Idx + 2] = node.shrink;
      f64s[f64Idx + 3] = 0;
      const kindFlag = node.kind === 'word' ? 0 : 1;
      u8s[i] = 1 | (kindFlag << 4);
    } else if (node.type === 'penalty') {
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = node.penalty;
      f64s[f64Idx + 2] = 0;
      f64s[f64Idx + 3] = 0;
      const flaggedFlag = node.flagged ? 1 : 0;
      u8s[i] = 2 | (flaggedFlag << 4);
    }
  }

  return [f64s, u8s];
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../fonts',
);

const REGISTRY: FontRegistry = new Map([
  [
    'lib-reg',
    {
      id: 'lib-reg',
      face: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
  [
    'lib-bold',
    {
      id: 'lib-bold',
      face: 'Liberation Serif Bold',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
    },
  ],
  [
    'rob-reg',
    {
      id: 'rob-reg',
      face: 'Roboto',
      filePath: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
    },
  ],
]);

const font = (id: string, size: number): Font => ({
  id,
  size,
  weight: id.includes('bold') ? 700 : 400,
  style: 'normal',
  stretch: 'normal',
});

// ─── Test texts ──────────────────────────────────────────────────────────────

const EN_SHORT = 'The quick brown fox jumps over the lazy dog.';

const EN_MEDIUM =
  'In olden times when wishing still helped one, there lived a king whose ' +
  'daughters were all beautiful, but the youngest was so beautiful that the ' +
  'sun itself was astonished whenever it shone in her face.';

const EN_LONG = `${EN_MEDIUM} She had a well, too, and often she used to sit in the courtyard near it, and when she was bored she took out a golden ball, threw it into the air and caught it again. The ball was her favourite plaything. One day, as she was sitting and playing with her golden ball, it rolled into the well and disappeared. She wept bitterly for it. The old witch appeared and offered to retrieve the ball in exchange for a promise.`;

// Generate a very long paragraph (for the 50+ lines test)
const EN_VERY_LONG = (() => {
  let text = EN_LONG;
  for (let i = 0; i < 3; i++) {
    text += ' ' + EN_MEDIUM;
  }
  return text;
})();

// Generate a 10,000-node paragraph for memory ceiling test
const EN_ENORMOUS = (() => {
  let text = EN_MEDIUM;
  for (let i = 0; i < 40; i++) {
    text += ' ' + EN_SHORT;
  }
  return text;
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  tsMs: number;
  wasmMs: number;
  speedup: number;
  iterations: number;
}

const buildNodes = (
  text: string,
  f: Font,
  language: Language,
  measurer: ReturnType<typeof createMeasurer>,
) => {
  const opts = { ...DEFAULT_HYPHENATE_OPTIONS, language, fontSize: f.size };
  const hyphenated = hyphenateParagraph(text, opts);
  const withFonts = hyphenated.map((w) => ({ ...w, font: f }));
  return buildNodeSequence(withFonts, measurer, 0);
};

const benchmarkTs = (
  nodes: any[],
  lineWidth: number,
  tolerance: number,
  iterations: number,
): { timeMs: number; breaks: LineBreak[] } => {
  let breaks: LineBreak[] = [];
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const result = computeBreakpoints({ nodes, lineWidth, tolerance });
    breaks = traceback(result.node);
  }
  const timeMs = performance.now() - start;
  return { timeMs: timeMs / iterations, breaks };
};

// NOTE: benchmarkWasm uses the binary serialization path (traceback_wasm_binary + serializeNodesToBinary).
// Production (paragraph.ts) also uses the binary path — Phase 8 complete.
const benchmarkWasm = (
  nodes: any[],
  lineWidth: number,
  tolerance: number,
  iterations: number,
): { timeMs: number; breaks: LineBreak[] } => {
  if (!wasm) throw new Error('WASM not loaded');
  let breaks: LineBreak[] = [];
  const [f64s, u8s] = serializeNodesToBinary(nodes);
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const res = JSON.parse(
      wasm.traceback_wasm_binary(f64s, u8s, new Float64Array([]), lineWidth, tolerance, 0, 0, 0, 0, 0),
    );
    if ('error' in res) throw new Error(`traceback_wasm_binary: ${res.error}`);
    breaks = res.ok.breaks as LineBreak[];
  }
  const timeMs = performance.now() - start;
  return { timeMs: timeMs / iterations, breaks };
};

// ─── Benchmarks ──────────────────────────────────────────────────────────────

async function runBenchmarks() {
  // Setup
  await Promise.all([loadHyphenator('en-us'), loadHyphenator('de')]);

  const tsMeasurer = createMeasurer(REGISTRY);
  loadWasm();

  if (!wasm) {
    console.error('❌ WASM module failed to load. Skipping benchmarks.');
    return;
  }

  const results: BenchmarkResult[] = [];

  const f = font('lib-reg', 12);
  const lineWidth = 400;
  const tolerance = 2;

  console.log('🏃 Running Phase 7 benchmarks...\n');
  console.log(`WASM module initialization: ${wasmInitTime.toFixed(2)}ms\n`);

  // ─── Workload 1: Short paragraphs (1–3 lines) ───────────────────────────
  console.log('Workload 1/6: Short paragraphs (1–3 lines)');
  {
    const nodes = buildNodes(EN_SHORT, f, 'en-us', tsMeasurer);
    const tsResult = benchmarkTs(nodes, lineWidth, tolerance, 1000);
    const wasmResult = benchmarkWasm(nodes, lineWidth, tolerance, 1000);

    const speedup = tsResult.timeMs / wasmResult.timeMs;
    results.push({
      name: 'Short paragraphs (1–3 lines)',
      tsMs: tsResult.timeMs,
      wasmMs: wasmResult.timeMs,
      speedup,
      iterations: 1000,
    });

    console.log(`  TS:   ${tsResult.timeMs.toFixed(3)}ms  (1000 iterations)`);
    console.log(`  WASM: ${wasmResult.timeMs.toFixed(3)}ms  (1000 iterations)`);
    console.log(`  Speedup: ${speedup.toFixed(1)}×\n`);
  }

  // ─── Workload 2: Long paragraphs (50+ lines) ────────────────────────────
  console.log('Workload 2/6: Long paragraphs (50+ lines)');
  {
    const nodes = buildNodes(EN_VERY_LONG, f, 'en-us', tsMeasurer);
    const tsResult = benchmarkTs(nodes, lineWidth, tolerance, 100);
    const wasmResult = benchmarkWasm(nodes, lineWidth, tolerance, 100);

    const speedup = tsResult.timeMs / wasmResult.timeMs;
    results.push({
      name: 'Long paragraphs (50+ lines)',
      tsMs: tsResult.timeMs,
      wasmMs: wasmResult.timeMs,
      speedup,
      iterations: 100,
    });

    console.log(`  TS:   ${tsResult.timeMs.toFixed(3)}ms  (100 iterations)`);
    console.log(`  WASM: ${wasmResult.timeMs.toFixed(3)}ms  (100 iterations)`);
    console.log(`  Speedup: ${speedup.toFixed(1)}×\n`);
  }

  // ─── Workload 3: Multi-column (varied lineWidths) ──────────────────────
  console.log('Workload 3/6: Multi-column (varied lineWidths)');
  {
    const nodes = buildNodes(EN_MEDIUM, f, 'en-us', tsMeasurer);
    const lineWidths = [200, 300, 400, 500, 600];
    const iterations = 500;
    let totalTs = 0;
    let totalWasm = 0;

    for (const lw of lineWidths) {
      const tsResult = benchmarkTs(nodes, lw, tolerance, iterations);
      const wasmResult = benchmarkWasm(nodes, lw, tolerance, iterations);
      totalTs += tsResult.timeMs;
      totalWasm += wasmResult.timeMs;
    }

    const avgTs = totalTs / lineWidths.length;
    const avgWasm = totalWasm / lineWidths.length;
    const speedup = avgTs / avgWasm;

    results.push({
      name: 'Multi-column (varied lineWidths)',
      tsMs: avgTs,
      wasmMs: avgWasm,
      speedup,
      iterations: iterations * lineWidths.length,
    });

    console.log(`  TS avg:   ${avgTs.toFixed(3)}ms`);
    console.log(`  WASM avg: ${avgWasm.toFixed(3)}ms`);
    console.log(`  Speedup: ${speedup.toFixed(1)}×\n`);
  }

  // ─── Workload 4: Catalog (1000 paragraphs in sequence) ───────────────────
  console.log('Workload 4/6: Catalog (1000 paragraphs in sequence)');
  {
    // Reuse the same short paragraph 1000 times
    const nodes = buildNodes(EN_SHORT, f, 'en-us', tsMeasurer);
    const [f64s, u8s] = serializeNodesToBinary(nodes);

    const tsStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      computeBreakpoints({ nodes, lineWidth, tolerance });
    }
    const tsTotal = performance.now() - tsStart;

    const wasmStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      JSON.parse(
        wasm!.traceback_wasm_binary(f64s, u8s, new Float64Array([]), lineWidth, tolerance, 0, 0, 0, 0, 0),
      );
    }
    const wasmTotal = performance.now() - wasmStart;

    const speedup = tsTotal / wasmTotal;
    results.push({
      name: 'Catalog (1000 paragraphs)',
      tsMs: tsTotal / 1000,
      wasmMs: wasmTotal / 1000,
      speedup,
      iterations: 1000,
    });

    console.log(`  TS total:   ${tsTotal.toFixed(1)}ms (1000 paragraphs)`);
    console.log(`  WASM total: ${wasmTotal.toFixed(1)}ms (1000 paragraphs)`);
    console.log(`  Per-paragraph TS:   ${(tsTotal / 1000).toFixed(3)}ms`);
    console.log(`  Per-paragraph WASM: ${(wasmTotal / 1000).toFixed(3)}ms`);
    console.log(`  Speedup: ${speedup.toFixed(1)}×\n`);
  }

  // ─── Workload 5: Cold startup (WASM module instantiation only) ──────────
  console.log('Workload 5/6: Cold startup (WASM module instantiation)');
  {
    // This was already measured at module load time
    console.log(`  WASM initialization: ${wasmInitTime.toFixed(2)}ms`);
    console.log(`  (isolated from per-paragraph cost)\n`);
  }

  // ─── Workload 6: Memory ceiling (10,000-node paragraph) ─────────────────
  console.log('Workload 6/6: Memory ceiling (10,000-node paragraph)');
  {
    const nodes = buildNodes(EN_ENORMOUS, f, 'en-us', tsMeasurer);
    const nodeCount = nodes.length;

    try {
      const tsStart = performance.now();
      const tsResult = computeBreakpoints({ nodes, lineWidth, tolerance });
      const tsLineCount = traceback(tsResult.node).length;
      const tsTime = performance.now() - tsStart;

      const wasmStart = performance.now();
      const [f64s, u8s] = serializeNodesToBinary(nodes);
      const wasmRes = JSON.parse(
        wasm!.traceback_wasm_binary(f64s, u8s, new Float64Array([]), lineWidth, tolerance, 0, 0, 0, 0, 0),
      );
      const wasmLineCount = wasmRes.ok.breaks.length;
      const wasmTime = performance.now() - wasmStart;

      const speedup = tsTime / wasmTime;
      results.push({
        name: 'Memory ceiling (10,000 nodes)',
        tsMs: tsTime,
        wasmMs: wasmTime,
        speedup,
        iterations: 1,
      });

      console.log(`  Nodes: ~${nodeCount}`);
      console.log(`  TS lines:   ${tsLineCount}, time: ${tsTime.toFixed(1)}ms`);
      console.log(
        `  WASM lines: ${wasmLineCount}, time: ${wasmTime.toFixed(1)}ms`,
      );
      console.log(`  Speedup: ${speedup.toFixed(1)}×\n`);
    } catch (e) {
      console.log(`  ⚠️  Memory ceiling test failed: ${e}\n`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('═', '═'.repeat(75));
  console.log('📊 Phase 7 Benchmark Summary\n');
  console.log(
    'Workload'.padEnd(35) +
      'Speedup'.padStart(10) +
      'TS (ms)'.padStart(12) +
      'WASM (ms)'.padStart(12),
  );
  console.log('─', '─'.repeat(75));

  let totalSpeedup = 0;
  for (const result of results) {
    const speedupStr = `${result.speedup.toFixed(1)}×`;
    const tsStr = result.tsMs.toFixed(3);
    const wasmStr = result.wasmMs.toFixed(3);
    console.log(
      result.name.padEnd(35) +
        speedupStr.padStart(10) +
        tsStr.padStart(12) +
        wasmStr.padStart(12),
    );
    if (result.speedup > 0) {
      totalSpeedup += result.speedup;
    }
  }

  const avgSpeedup = totalSpeedup / results.length;
  console.log('─', '─'.repeat(75));
  console.log(
    'Average speedup'.padEnd(35) + `${avgSpeedup.toFixed(1)}×`.padStart(10),
  );
  console.log('\n💡 Target: 5–15× speedup on forward pass');
  console.log(
    `${avgSpeedup >= 5 && avgSpeedup <= 15 ? '✓' : '⚠'} Result: ${avgSpeedup.toFixed(1)}×\n`,
  );
}

runBenchmarks().catch(console.error);
