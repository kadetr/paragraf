import * as path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { createMeasurer } from '../src/index.js';
import type { Font, FontRegistry } from '@paragraf/types';

// Cache management APIs are not yet exposed by @paragraf/font-engine (workId 001 cancelled).
// These stubs keep the benchmark runnable and report placeholder stats.
function getCacheStats(): { size: number; hits: number; misses: number } {
  return { size: 0, hits: 0, misses: 0 };
}
function clearWordMeasureCache(): void {
  // no-op: cache not yet implemented in font-engine
}

type RunMode =
  | 'both-enabled'
  | 'font-engine-only'
  | 'shaping-wasm-only'
  | 'both-disabled';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const REGULAR_FONT_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const REGISTRY: FontRegistry = new Map([
  [
    'benchmark-font',
    {
      id: 'benchmark-font',
      family: 'Liberation Serif',
      filePath: REGULAR_FONT_PATH,
    },
  ],
]);

const FONT: Font = {
  id: 'benchmark-font',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const PARAGRAPH =
  'In olden times when wishing still helped one there lived a king whose daughters were all beautiful and the youngest was so beautiful that the sun itself was astonished whenever it shone in her face.';

const WORDS = PARAGRAPH.split(/\s+/g);
const ITERATIONS = 250;

async function loadShapingWasmStatsAccessor(): Promise<(() => unknown) | null> {
  try {
    const mod = await import('@paragraf/shaping-wasm');
    if (typeof (mod as any).getFaceCacheStats === 'function') {
      return () => (mod as any).getFaceCacheStats();
    }
  } catch {
    // Optional dependency for this benchmark mode; skip when not available.
  }
  return null;
}

function forceGcIfAvailable(): void {
  if (typeof global.gc === 'function') global.gc();
}

function runComposeLikeLoop(
  mode: RunMode,
  featureSetId: string,
): { durationMs: number; totalWidth: number } {
  clearWordMeasureCache();

  const fontEngineCacheEnabled =
    mode === 'both-enabled' || mode === 'font-engine-only';

  const measurer = createMeasurer(REGISTRY, undefined, undefined, undefined);

  const start = performance.now();
  let totalWidth = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    for (const word of WORDS) {
      totalWidth += measurer.measure(word, FONT, featureSetId);
    }
  }

  const durationMs = performance.now() - start;
  return { durationMs, totalWidth };
}

function printSummary(
  mode: RunMode,
  cold: { durationMs: number },
  warm: { durationMs: number },
  heapBefore: number,
  heapAfter: number,
  faceStats: unknown,
): void {
  const feStats = getCacheStats();
  const hitRate =
    feStats.hits + feStats.misses > 0
      ? feStats.hits / (feStats.hits + feStats.misses)
      : 0;

  console.log(`mode=${mode}`);
  console.log(`cold_ms=${cold.durationMs.toFixed(3)}`);
  console.log(`warm_ms=${warm.durationMs.toFixed(3)}`);
  console.log(
    `cold_warm_delta_ms=${(cold.durationMs - warm.durationMs).toFixed(3)}`,
  );
  console.log(
    `total_duration_ms=${(cold.durationMs + warm.durationMs).toFixed(3)}`,
  );
  console.log(`font_engine_cache_size=${feStats.size}`);
  console.log(`font_engine_cache_hits=${feStats.hits}`);
  console.log(`font_engine_cache_misses=${feStats.misses}`);
  console.log(`font_engine_cache_hit_rate=${hitRate.toFixed(6)}`);
  console.log(`font_engine_cache_evictions=NA`);
  console.log(`heap_before=${heapBefore}`);
  console.log(`heap_after=${heapAfter}`);
  console.log(`heap_delta=${heapAfter - heapBefore}`);
  console.log(`baseline_reference_ms=250`);

  if (faceStats != null) {
    console.log(`shaping_wasm_face_cache_stats=${JSON.stringify(faceStats)}`);
  } else {
    console.log('shaping_wasm_face_cache_stats=unavailable');
  }

  console.log('---');
}

async function main(): Promise<void> {
  const getFaceStats = await loadShapingWasmStatsAccessor();

  const modes: RunMode[] = [
    'both-enabled',
    'font-engine-only',
    'shaping-wasm-only',
    'both-disabled',
  ];

  for (const mode of modes) {
    forceGcIfAvailable();
    const heapBefore = process.memoryUsage().heapUsed;

    const cold = runComposeLikeLoop(mode, 'feat-benchmark');
    const warm = runComposeLikeLoop(mode, 'feat-benchmark');

    forceGcIfAvailable();
    const heapAfter = process.memoryUsage().heapUsed;

    const faceStats = getFaceStats ? getFaceStats() : null;
    printSummary(mode, cold, warm, heapBefore, heapAfter, faceStats);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
