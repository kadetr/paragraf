import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as path from 'path';
import {
  createParagraphComposer,
  clearMeasureCache,
  configureMeasureCache,
  getMeasureCacheStats,
  featureSetIdFromConfig,
  FeatureConfig,
} from '@paragraf/typography';
import { FontRegistry, Font } from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const REGULAR_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const FONT_REGULAR: Font = {
  id: 'liberation-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      family: 'Liberation Serif',
      filePath: REGULAR_PATH,
    },
  ],
]);

afterEach(() => {
  clearMeasureCache();
});

// ─── featureSetIdFromConfig — determinism ─────────────────────────────────────

describe('featureSetIdFromConfig', () => {
  it('same config produces the same ID (deterministic)', () => {
    const config: FeatureConfig = { liga: true, calt: false };
    expect(featureSetIdFromConfig(config)).toBe(featureSetIdFromConfig(config));
  });

  it('key insertion order does not affect the ID', () => {
    const a: FeatureConfig = { liga: true, calt: false };
    const b: FeatureConfig = { calt: false, liga: true };
    expect(featureSetIdFromConfig(a)).toBe(featureSetIdFromConfig(b));
  });

  it('different configs produce different IDs', () => {
    const a: FeatureConfig = { liga: true, calt: false };
    const b: FeatureConfig = { liga: false, calt: false };
    expect(featureSetIdFromConfig(a)).not.toBe(featureSetIdFromConfig(b));
  });

  it('empty config produces a stable ID', () => {
    expect(featureSetIdFromConfig({})).toBe(featureSetIdFromConfig({}));
  });

  it('adding a key changes the ID', () => {
    const base: FeatureConfig = { liga: true };
    const extended: FeatureConfig = { liga: true, kern: true };
    expect(featureSetIdFromConfig(base)).not.toBe(
      featureSetIdFromConfig(extended),
    );
  });
});

// ─── featureConfig cache key integration ─────────────────────────────────────

describe('featureConfig cache key (integration)', () => {
  it('two composers with same featureConfig share cache entries', async () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    const config: FeatureConfig = { liga: true, calt: false };

    const composerA = await createParagraphComposer(REGISTRY, {
      measureCache: { featureConfig: config, registryId: 'shared-registry' },
    });
    const composerB = await createParagraphComposer(REGISTRY, {
      measureCache: { featureConfig: config, registryId: 'shared-registry' },
    });

    composerA.compose({
      text: 'shared cache test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterA = getMeasureCacheStats();

    composerB.compose({
      text: 'shared cache test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterB = getMeasureCacheStats();

    // Second composer should hit entries written by first
    expect(afterB.hits).toBeGreaterThan(afterA.hits);
  });

  it('two composers with different featureConfig do not share cache entries', async () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    const composerA = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureConfig: { liga: true },
        registryId: 'shared-registry-2',
      },
    });
    const composerB = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureConfig: { liga: false },
        registryId: 'shared-registry-2',
      },
    });

    composerA.compose({
      text: 'no share test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterA = getMeasureCacheStats();

    composerB.compose({
      text: 'no share test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterB = getMeasureCacheStats();

    // Different feature configs — B should not hit A's entries
    expect(afterB.hits).toBe(afterA.hits);
    expect(afterB.misses).toBeGreaterThan(afterA.misses);
  });
});

// ─── Backward compatibility ───────────────────────────────────────────────────

describe('backward compat: string featureSetId', () => {
  it('existing string featureSetId still produces correct cache hits', async () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    const composerA = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureSetId: 'my-feature-set',
        registryId: 'compat-registry',
      },
    });
    const composerB = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureSetId: 'my-feature-set',
        registryId: 'compat-registry',
      },
    });

    composerA.compose({
      text: 'compat string test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterA = getMeasureCacheStats();

    composerB.compose({
      text: 'compat string test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterB = getMeasureCacheStats();

    expect(afterB.hits).toBeGreaterThan(afterA.hits);
  });
});

describe('backward compat: no featureSetId uses default', () => {
  it('no featureSetId → __default-feature-set__ fallback (composers share cache)', async () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    const composerA = await createParagraphComposer(REGISTRY, {
      measureCache: {},
    });
    const composerB = await createParagraphComposer(REGISTRY, {
      measureCache: {},
    });

    composerA.compose({
      text: 'default fallback test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterA = getMeasureCacheStats();

    composerB.compose({
      text: 'default fallback test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterB = getMeasureCacheStats();

    expect(afterB.hits).toBeGreaterThan(afterA.hits);
  });
});

// ─── featureConfig precedence ─────────────────────────────────────────────────

describe('featureConfig vs featureSetId precedence', () => {
  it('featureConfig takes precedence over featureSetId string', async () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    // Both composers use featureConfig { liga: true } — featureSetId string is ignored
    const composerA = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureConfig: { liga: true },
        featureSetId: 'ignored-string',
        registryId: 'precedence-registry',
      },
    });
    const composerB = await createParagraphComposer(REGISTRY, {
      measureCache: {
        featureConfig: { liga: true },
        featureSetId: 'also-ignored',
        registryId: 'precedence-registry',
      },
    });

    composerA.compose({
      text: 'precedence test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterA = getMeasureCacheStats();

    composerB.compose({
      text: 'precedence test',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const afterB = getMeasureCacheStats();

    // featureConfig wins — same config → cache hits
    expect(afterB.hits).toBeGreaterThan(afterA.hits);
  });
});
