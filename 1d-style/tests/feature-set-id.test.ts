import { describe, it, expect } from 'vitest';
import { featureSetIdFromConfig, defineStyles } from '../src/index.js';
import type { FontFeatures, ParagraphStyleDef } from '../src/index.js';

// RT1: same string regardless of insertion order
describe('featureSetIdFromConfig — determinism', () => {
  it('produces same string regardless of key insertion order', () => {
    const a: FontFeatures = { liga: true, kern: false, calt: true };
    const b: FontFeatures = { kern: false, calt: true, liga: true };
    expect(featureSetIdFromConfig(a)).toBe(featureSetIdFromConfig(b));
  });

  // RT2: empty object
  it('handles empty object', () => {
    expect(featureSetIdFromConfig({})).toBe('[]');
  });

  // RT3: different values produce different strings
  it('produces different strings for {liga:true} vs {liga:false}', () => {
    expect(featureSetIdFromConfig({ liga: true })).not.toBe(
      featureSetIdFromConfig({ liga: false }),
    );
  });
});

// RT4: ParagraphStyleDef accepts features field (type-level)
describe('ParagraphStyleDef — features field', () => {
  it('accepts features field without type error', () => {
    const def: ParagraphStyleDef = {
      features: { liga: true, kern: false },
    };
    expect(def.features).toEqual({ liga: true, kern: false });
  });
});

// RT5–RT8: integration tests via defineStyles / resolve
describe('features — inheritance resolution', () => {
  // RT5: undefined when no chain sets it
  it('features is undefined when no style in chain sets it', () => {
    const styles = defineStyles({ body: {} });
    expect(styles.resolve('body').features).toBeUndefined();
  });

  // RT6: set when chain defines it
  it('features is present when the style sets it', () => {
    const styles = defineStyles({
      body: { features: { liga: true, kern: true } },
    });
    expect(styles.resolve('body').features).toEqual({ liga: true, kern: true });
  });

  // RT7: child without features inherits parent's features
  it('features propagates from parent to child that does not set it', () => {
    const styles = defineStyles({
      base: { features: { liga: true } },
      child: { extends: 'base' },
    });
    expect(styles.resolve('child').features).toEqual({ liga: true });
  });

  // RT8: child features override parent (last non-undefined wins)
  it('child features overrides parent features', () => {
    const styles = defineStyles({
      base: { features: { liga: true, kern: true } },
      child: { extends: 'base', features: { liga: false } },
    });
    expect(styles.resolve('child').features).toEqual({ liga: false });
  });
});
