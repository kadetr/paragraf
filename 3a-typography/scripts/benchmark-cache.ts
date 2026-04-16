import * as path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import {
  clearMeasureCache,
  configureMeasureCache,
  createParagraphComposer,
  getMeasureCacheStats,
} from '../src/index.js';
import type { Font, FontRegistry } from '@paragraf/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.resolve(__dirname, '../../fonts');

type RunMode =
  | 'wasm-cache-on'
  | 'wasm-cache-off'
  | 'ts-cache-on'
  | 'ts-cache-off';

const REGISTRY: FontRegistry = new Map([
  [
    'benchmark-font',
    {
      id: 'benchmark-font',
      family: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
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

const TEXT =
  'In olden times when wishing still helped one there lived a king whose daughters were all beautiful and the youngest was so beautiful that the sun itself was astonished whenever it shone in her face.';

const ITERATIONS = 250;

function forceGcIfAvailable(): void {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

async function loadFaceCacheStatsAccessor(): Promise<(() => unknown) | null> {
  try {
    const mod = await import('@paragraf/shaping-wasm');
    if (typeof (mod as any).getFaceCacheStats === 'function') {
      return () => (mod as any).getFaceCacheStats();
    }
  } catch {
    // Optional dependency in this benchmark context.
  }
  return null;
}

function modeToOptions(mode: RunMode): {
  useWasm: boolean;
  cacheEnabled: boolean;
} {
  switch (mode) {
    case 'wasm-cache-on':
      return { useWasm: true, cacheEnabled: true };
    case 'wasm-cache-off':
      return { useWasm: true, cacheEnabled: false };
    case 'ts-cache-on':
      return { useWasm: false, cacheEnabled: true };
    case 'ts-cache-off':
      return { useWasm: false, cacheEnabled: false };
  }
}

async function runComposeLoop(mode: RunMode): Promise<{ durationMs: number }> {
  const { useWasm, cacheEnabled } = modeToOptions(mode);

  clearMeasureCache();
  configureMeasureCache({
    enabled: cacheEnabled,
    maxCacheEntries: cacheEnabled ? 10_000 : 0,
  });

  const composer = await createParagraphComposer(REGISTRY, {
    useWasm,
    measureCache: {
      enabled: cacheEnabled,
      maxCacheEntries: cacheEnabled ? 10_000 : 0,
      featureSetId: 'feat-benchmark',
    },
  });

  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 396,
      tolerance: 2,
      alignment: 'justified',
      language: 'en-us',
      opticalMarginAlignment: false,
    });
  }
  const durationMs = performance.now() - start;
  return { durationMs };
}

function printSummary(
  mode: RunMode,
  cold: { durationMs: number },
  warm: { durationMs: number },
  heapBefore: number,
  heapAfter: number,
  faceStats: unknown,
): void {
  const cacheStats = getMeasureCacheStats();
  const hitRate =
    cacheStats.hits + cacheStats.misses > 0
      ? cacheStats.hits / (cacheStats.hits + cacheStats.misses)
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
  console.log(`measure_cache_size=${cacheStats.size}`);
  console.log(`measure_cache_hits=${cacheStats.hits}`);
  console.log(`measure_cache_misses=${cacheStats.misses}`);
  console.log(`measure_cache_evictions=${cacheStats.evictions}`);
  console.log(`measure_cache_hit_rate=${hitRate.toFixed(6)}`);
  console.log(`heap_before=${heapBefore}`);
  console.log(`heap_after=${heapAfter}`);
  console.log(`heap_delta=${heapAfter - heapBefore}`);
  console.log('baseline_reference_ms=250');

  if (faceStats != null) {
    console.log(`shaping_wasm_face_cache_stats=${JSON.stringify(faceStats)}`);
  } else {
    console.log('shaping_wasm_face_cache_stats=unavailable');
  }

  console.log('---');
}

async function main(): Promise<void> {
  const modes: RunMode[] = [
    'wasm-cache-on',
    'wasm-cache-off',
    'ts-cache-on',
    'ts-cache-off',
  ];

  const getFaceStats = await loadFaceCacheStatsAccessor();

  for (const mode of modes) {
    forceGcIfAvailable();
    const heapBefore = process.memoryUsage().heapUsed;

    const cold = await runComposeLoop(mode);
    const warm = await runComposeLoop(mode);

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
