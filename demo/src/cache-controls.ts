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
