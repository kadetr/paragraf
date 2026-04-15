// demo/src/cache-controls.ts
// Shared, WASM-free cache controls so pages can toggle measure caching
// without importing the WASM measurer implementation.

export type BrowserMeasureCacheConfig = {
  enabled: boolean;
  maxEntries: number;
};

const DEFAULT_BROWSER_MEASURE_CACHE_CONFIG: BrowserMeasureCacheConfig = {
  enabled: true,
  maxEntries: 10_000,
};

let _browserMeasureCacheConfig: BrowserMeasureCacheConfig = {
  ...DEFAULT_BROWSER_MEASURE_CACHE_CONFIG,
};

export function configureBrowserMeasureCache(
  options: Partial<BrowserMeasureCacheConfig> = {},
): BrowserMeasureCacheConfig {
  _browserMeasureCacheConfig = {
    enabled: options.enabled ?? _browserMeasureCacheConfig.enabled,
    maxEntries: options.maxEntries ?? _browserMeasureCacheConfig.maxEntries,
  };

  if (_browserMeasureCacheConfig.maxEntries < 0) {
    _browserMeasureCacheConfig.maxEntries = 0;
  }

  return getBrowserMeasureCacheConfig();
}

export function getBrowserMeasureCacheConfig(): BrowserMeasureCacheConfig {
  return { ..._browserMeasureCacheConfig };
}

// Registered by measurer.ts so that applyBrowserMeasureCacheConfig can clear
// the actual cache store without creating a circular dependency.
let _clearCacheCallback: (() => void) | null = null;

export function registerBrowserMeasureCacheClearer(fn: () => void): void {
  _clearCacheCallback = fn;
}

/**
 * Apply cache config and, when disabling or zeroing maxEntries, clear the
 * existing cache store so stale widths are not returned on the next run.
 */
export function applyBrowserMeasureCacheConfig(
  options: Partial<BrowserMeasureCacheConfig> = {},
): BrowserMeasureCacheConfig {
  const cfg = configureBrowserMeasureCache(options);
  if (!cfg.enabled || cfg.maxEntries === 0) {
    _clearCacheCallback?.();
  }
  return cfg;
}
