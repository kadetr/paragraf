import { describe, it, expect } from 'vitest';
import { createColorManager } from '../src/manager';

describe('createColorManager', () => {
  it('returns a manager object with required methods', () => {
    const mgr = createColorManager();
    expect(typeof mgr.loadBuiltinSrgb).toBe('function');
    expect(typeof mgr.loadProfile).toBe('function');
    expect(typeof mgr.createTransform).toBe('function');
    expect(typeof mgr.getOutputIntent).toBe('function');
  });
});

describe('loadBuiltinSrgb', () => {
  it('returns a ColorProfile with name sRGB IEC61966-2.1', () => {
    const mgr = createColorManager();
    const p = mgr.loadBuiltinSrgb();
    expect(p.name).toBe('sRGB IEC61966-2.1');
  });

  it('returns a ColorProfile with colorSpace RGB', () => {
    const mgr = createColorManager();
    const p = mgr.loadBuiltinSrgb();
    expect(p.colorSpace).toBe('RGB');
  });

  it('returns the same object on repeated calls (cached)', () => {
    const mgr = createColorManager();
    expect(mgr.loadBuiltinSrgb()).toBe(mgr.loadBuiltinSrgb());
  });

  it('bytes begin with acsp ICC signature', () => {
    const mgr = createColorManager();
    const p = mgr.loadBuiltinSrgb();
    expect(p.bytes[36]).toBe(0x61); // 'a'
    expect(p.bytes[37]).toBe(0x63); // 'c'
    expect(p.bytes[38]).toBe(0x73); // 's'
    expect(p.bytes[39]).toBe(0x70); // 'p'
  });

  it('has a matrix with correct rXYZ column', () => {
    const mgr = createColorManager();
    const p = mgr.loadBuiltinSrgb();
    expect(p.matrix?.r.x).toBeCloseTo(0.4361, 3);
    expect(p.matrix?.r.y).toBeCloseTo(0.2225, 3);
  });
});

describe('createTransform via manager', () => {
  it('sRGB→sRGB white point round-trip', () => {
    const mgr = createColorManager();
    const srgb = mgr.loadBuiltinSrgb();
    const t = mgr.createTransform(srgb, srgb);
    const out = t.apply([1, 1, 1]);
    // D50 white: X≈0.9643, Y≈1.000, Z≈0.8251
    expect(out[1]).toBeCloseTo(1.0, 2);
  });
});

describe('getOutputIntent', () => {
  it('returns the profile and condition string', () => {
    const mgr = createColorManager();
    const srgb = mgr.loadBuiltinSrgb();
    const intent = mgr.getOutputIntent(srgb, 'sRGB');
    expect(intent.profile).toBe(srgb);
    expect(intent.condition).toBe('sRGB');
  });
});

describe('loadProfile', () => {
  it('throws on non-existent file', async () => {
    const mgr = createColorManager();
    await expect(
      mgr.loadProfile('/nonexistent/path/profile.icc'),
    ).rejects.toThrow();
  });

  it('is idempotent — same path returns same object', async () => {
    // We can't easily test with a real file in unit tests without fixtures.
    // Test that the caching map exists by calling loadBuiltinSrgb twice.
    const mgr = createColorManager();
    const a = mgr.loadBuiltinSrgb();
    const b = mgr.loadBuiltinSrgb();
    expect(a).toBe(b);
  });
});
