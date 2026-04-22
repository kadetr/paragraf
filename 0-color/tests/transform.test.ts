import { describe, it, expect } from 'vitest';
import {
  createTransform,
  applyTrcForward,
  applyTrcInverse,
  xyzToIccLab,
} from '../src/transform';
import { parseIccProfile } from '../src/profile';
import { buildSrgbProfileBytes } from '../src/srgb';
import type { TrcCurve, XYZValue } from '../src/profile';

// ─── applyTrcForward ─────────────────────────────────────────────────────────

describe('applyTrcForward', () => {
  it('linear TRC: output === input', () => {
    const trc: TrcCurve = { kind: 'linear' };
    expect(applyTrcForward(trc, 0.5)).toBeCloseTo(0.5, 6);
    expect(applyTrcForward(trc, 0.0)).toBeCloseTo(0.0, 6);
    expect(applyTrcForward(trc, 1.0)).toBeCloseTo(1.0, 6);
  });

  it('gamma TRC 1.0: output === input', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 1.0 };
    expect(applyTrcForward(trc, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('gamma TRC 2.2: 0.5^2.2 ≈ 0.2177', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 2.2 };
    expect(applyTrcForward(trc, 0.5)).toBeCloseTo(Math.pow(0.5, 2.2), 5);
  });

  it('gamma TRC 2.2: 1.0 → 1.0', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 2.2 };
    expect(applyTrcForward(trc, 1.0)).toBeCloseTo(1.0, 6);
  });

  it('gamma TRC 2.2: 0.0 → 0.0', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 2.2 };
    expect(applyTrcForward(trc, 0.0)).toBeCloseTo(0.0, 6);
  });

  it('lut TRC: interpolates correctly', () => {
    const values = Float64Array.from([0, 0.25, 1.0]);
    const trc: TrcCurve = { kind: 'lut', values };
    // 3 entries → t=0.5 maps to f=0.5*2=1.0 → exactly index 1 → 0.25
    expect(applyTrcForward(trc, 0.5)).toBeCloseTo(0.25, 5);
    // t=0.25 → f=0.5 → between index 0 (0) and index 1 (0.25) with frac=0.5 → 0.125
    expect(applyTrcForward(trc, 0.25)).toBeCloseTo(0.125, 5);
  });
});

// ─── applyTrcInverse ─────────────────────────────────────────────────────────

describe('applyTrcInverse', () => {
  it('linear TRC: output === input (clamped)', () => {
    const trc: TrcCurve = { kind: 'linear' };
    expect(applyTrcInverse(trc, 0.5)).toBeCloseTo(0.5, 6);
    expect(applyTrcInverse(trc, 0.0)).toBeCloseTo(0.0, 6);
    expect(applyTrcInverse(trc, 1.0)).toBeCloseTo(1.0, 6);
  });

  it('gamma TRC 2.2: inverse of forward is identity', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 2.2 };
    const v = 0.5;
    expect(applyTrcInverse(trc, applyTrcForward(trc, v))).toBeCloseTo(v, 5);
    expect(applyTrcInverse(trc, applyTrcForward(trc, 0.0))).toBeCloseTo(0.0, 5);
    expect(applyTrcInverse(trc, applyTrcForward(trc, 1.0))).toBeCloseTo(1.0, 5);
  });

  it('gamma TRC 2.2: 0.5^(1/2.2) round-trips', () => {
    const trc: TrcCurve = { kind: 'gamma', gamma: 2.2 };
    const linear = Math.pow(0.5, 2.2); // forward
    expect(applyTrcInverse(trc, linear)).toBeCloseTo(0.5, 5);
  });
});

// ─── createTransform — sRGB → sRGB (identity round-trip) ─────────────────────

describe('createTransform — sRGB identity', () => {
  it('sRGB → sRGB is a full round-trip: white [1,1,1] → [1,1,1]', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([1, 1, 1]);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(1.0, 4);
    expect(out[2]).toBeCloseTo(1.0, 4);
  });

  it('sRGB → sRGB black [0,0,0] → [0,0,0]', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0, 0, 0]);
    expect(out[0]).toBeCloseTo(0.0, 6);
    expect(out[1]).toBeCloseTo(0.0, 6);
    expect(out[2]).toBeCloseTo(0.0, 6);
  });

  it('sRGB → sRGB red [1,0,0] → [1,0,0]', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([1, 0, 0]);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(0.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('sRGB → sRGB green [0,1,0] → [0,1,0]', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0, 1, 0]);
    expect(out[0]).toBeCloseTo(0.0, 4);
    expect(out[1]).toBeCloseTo(1.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('sRGB → sRGB mid-gray [0.5,0.5,0.5] → [0.5,0.5,0.5]', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0.5, 0.5, 0.5]);
    expect(out[0]).toBeCloseTo(0.5, 4);
    expect(out[1]).toBeCloseTo(0.5, 4);
    expect(out[2]).toBeCloseTo(0.5, 4);
  });

  it('output has exactly 3 channels', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    expect(transform.apply([0.3, 0.5, 0.7])).toHaveLength(3);
  });
});

// ─── xyzToIccLab ─────────────────────────────────────────────────────────────

describe('xyzToIccLab', () => {
  const D50: XYZValue = { x: 0.9642, y: 1.0, z: 0.8249 };

  it('D50 white point maps to L=1, a=0.5, b=0.5 (ICC-normalized)', () => {
    // D50 white: XYZ = [0.9642, 1.0, 0.8249] → Lab = [100, 0, 0]
    // ICC-normalized: L/100=1.0, (a+128)/255≈0.502, (b+128)/255≈0.502
    const out = xyzToIccLab([0.9642, 1.0, 0.8249], D50);
    expect(out[0]).toBeCloseTo(1.0, 2);
    expect(out[1]).toBeCloseTo(128 / 255, 2);
    expect(out[2]).toBeCloseTo(128 / 255, 2);
  });

  it('black (0,0,0) maps to L=0 in ICC-normalized output', () => {
    const out = xyzToIccLab([0, 0, 0], D50);
    expect(out[0]).toBeCloseTo(0, 2);
  });

  it('output array has exactly 3 elements', () => {
    const out = xyzToIccLab([0.5, 0.5, 0.5], D50);
    expect(out).toHaveLength(3);
  });
});

// ─── createTransform — rendering intent variants ──────────────────────────────

describe('createTransform — rendering intent variants', () => {
  it('relative intent: sRGB white maps to valid XYZ output', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const t = createTransform(srgb, srgb, 'relative');
    const out = t.apply([1, 1, 1]);
    expect(out).toHaveLength(3);
    out.forEach((v) => expect(isFinite(v)).toBe(true));
  });

  it('saturation intent: sRGB white maps to valid XYZ output', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const t = createTransform(srgb, srgb, 'saturation');
    const out = t.apply([1, 1, 1]);
    expect(out).toHaveLength(3);
    out.forEach((v) => expect(isFinite(v)).toBe(true));
  });

  it('absolute intent: sRGB white maps to valid XYZ output', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const t = createTransform(srgb, srgb, 'absolute');
    const out = t.apply([1, 1, 1]);
    expect(out).toHaveLength(3);
    out.forEach((v) => expect(isFinite(v)).toBe(true));
  });
});
