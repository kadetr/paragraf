// demo/src/measurer.ts
// createBrowserMeasurer — wraps the WASM measurement functions
// to produce a Measurer compatible with @paragraf/linebreak and @paragraf/render-core.

import type {
  Font,
  FontMetrics,
  Measurer,
  GlueSpaceMetrics,
  FontRegistry,
} from '@paragraf/compile';
import {
  measure_text_wasm,
  space_metrics_wasm,
  font_metrics_wasm,
} from '../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js';
import {
  configureBrowserMeasureCache,
  getBrowserMeasureCacheConfig,
} from './cache-controls.js';

type BrowserMeasureCacheStats = {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
};

const _browserMeasureCacheStore = new Map<string, number>();
const _browserMeasureCacheStats: BrowserMeasureCacheStats = {
  size: 0,
  hits: 0,
  misses: 0,
  evictions: 0,
};

function syncBrowserMeasureCacheSize(): void {
  _browserMeasureCacheStats.size = _browserMeasureCacheStore.size;
}

function touchBrowserMeasureCacheKey(key: string, value: number): void {
  if (_browserMeasureCacheStore.has(key)) {
    _browserMeasureCacheStore.delete(key);
  }
  _browserMeasureCacheStore.set(key, value);
}

function buildBrowserMeasureCacheKey(content: string, font: Font): string {
  return JSON.stringify([
    content,
    font.id,
    font.size,
    font.weight,
    font.style,
    font.stretch,
    font.letterSpacing ?? 0,
    font.variant ?? 'normal',
  ]);
}

export function applyBrowserMeasureCacheConfig(
  options: Parameters<typeof configureBrowserMeasureCache>[0] = {},
): ReturnType<typeof getBrowserMeasureCacheConfig> {
  const cfg = configureBrowserMeasureCache(options);
  if (!cfg.enabled || cfg.maxEntries === 0) {
    clearBrowserMeasureCache();
  }
  return cfg;
}

export function clearBrowserMeasureCache(): void {
  _browserMeasureCacheStore.clear();
  syncBrowserMeasureCacheSize();
}

export function resetBrowserMeasureCacheStats(): void {
  _browserMeasureCacheStats.hits = 0;
  _browserMeasureCacheStats.misses = 0;
  _browserMeasureCacheStats.evictions = 0;
  syncBrowserMeasureCacheSize();
}

export function getBrowserMeasureCacheStats(): BrowserMeasureCacheStats {
  return {
    size: _browserMeasureCacheStore.size,
    hits: _browserMeasureCacheStats.hits,
    misses: _browserMeasureCacheStats.misses,
    evictions: _browserMeasureCacheStats.evictions,
  };
}

export function createBrowserMeasurer(registry: FontRegistry): Measurer {
  return {
    measure(content: string, font: Font): number {
      const cfg = getBrowserMeasureCacheConfig();
      if (!cfg.enabled || cfg.maxEntries === 0) {
        const rawNoCache = JSON.parse(
          measure_text_wasm(content, JSON.stringify(font)),
        );
        if ('error' in rawNoCache) {
          throw new Error(`measure_text_wasm: ${rawNoCache.error}`);
        }
        return rawNoCache.ok.width as number;
      }

      const key = buildBrowserMeasureCacheKey(content, font);
      const cached = _browserMeasureCacheStore.get(key);
      if (cached != null) {
        _browserMeasureCacheStats.hits += 1;
        touchBrowserMeasureCacheKey(key, cached);
        return cached;
      }

      _browserMeasureCacheStats.misses += 1;
      const raw = JSON.parse(measure_text_wasm(content, JSON.stringify(font)));
      if ('error' in raw) throw new Error(`measure_text_wasm: ${raw.error}`);
      const measured = raw.ok.width as number;

      touchBrowserMeasureCacheKey(key, measured);
      if (_browserMeasureCacheStore.size > cfg.maxEntries) {
        const oldestKey = _browserMeasureCacheStore.keys().next().value;
        if (oldestKey !== undefined) {
          _browserMeasureCacheStore.delete(oldestKey);
          _browserMeasureCacheStats.evictions += 1;
        }
      }
      syncBrowserMeasureCacheSize();

      return measured;
    },
    space(font: Font): GlueSpaceMetrics {
      const raw = JSON.parse(space_metrics_wasm(JSON.stringify(font)));
      if ('error' in raw) throw new Error(`space_metrics_wasm: ${raw.error}`);
      return raw.ok as GlueSpaceMetrics;
    },
    metrics(font: Font): FontMetrics {
      const raw = JSON.parse(font_metrics_wasm(JSON.stringify(font)));
      if ('error' in raw) throw new Error(`font_metrics_wasm: ${raw.error}`);
      return raw.ok as FontMetrics;
    },
    registry,
  };
}
