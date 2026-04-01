import { describe, it, expect } from 'vitest';
import { createTransform, applyTrcForward } from '../src/transform';
import { parseIccProfile } from '../src/profile';
import { buildSrgbProfileBytes } from '../src/srgb';
import type { TrcCurve } from '../src/profile';

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

// ─── createTransform — sRGB → sRGB (sanity identity) ─────────────────────────

describe('createTransform — sRGB identity', () => {
  it('sRGB → sRGB white maps to D50 XYZ white point', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    // Both profiles identical → we still get the matrix output (this isn't
    // identity in XYZ space — it's sRGB device→XYZ via matrix)
    const out = transform.apply([1, 1, 1]);
    // sRGB white in linear space is [1,1,1], matrix gives approx D50 white:
    // X = rXYZ.x+gXYZ.x+bXYZ.x = 0.4361+0.3851+0.1431 = 0.9643
    // Y = rXYZ.y+gXYZ.y+bXYZ.y = 0.2225+0.7169+0.0606 = 1.0000
    // Z = rXYZ.z+gXYZ.z+bXYZ.z = 0.0139+0.0971+0.7141 = 0.8251
    expect(out[0]).toBeCloseTo(0.9643, 2);
    expect(out[1]).toBeCloseTo(1.0, 2);
    expect(out[2]).toBeCloseTo(0.8251, 2);
  });

  it('sRGB → sRGB black maps to (0, 0, 0)', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0, 0, 0]);
    expect(out[0]).toBeCloseTo(0.0, 6);
    expect(out[1]).toBeCloseTo(0.0, 6);
    expect(out[2]).toBeCloseTo(0.0, 6);
  });

  it('sRGB red (1,0,0) maps to rXYZ column', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    // 1.0^2.2 = 1.0, so linear red = 1.0 → output = rXYZ
    const out = transform.apply([1, 0, 0]);
    expect(out[0]).toBeCloseTo(0.4361, 3);
    expect(out[1]).toBeCloseTo(0.2225, 3);
    expect(out[2]).toBeCloseTo(0.0139, 3);
  });

  it('sRGB green (0,1,0) maps to gXYZ column', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0, 1, 0]);
    expect(out[0]).toBeCloseTo(0.3851, 3);
    expect(out[1]).toBeCloseTo(0.7169, 3);
    expect(out[2]).toBeCloseTo(0.0971, 3);
  });

  it('mid-gray (0.5, 0.5, 0.5) linearizes via gamma 2.2', () => {
    const srgb = parseIccProfile(buildSrgbProfileBytes());
    const transform = createTransform(srgb, srgb, 'perceptual');
    const out = transform.apply([0.5, 0.5, 0.5]);
    const lin = Math.pow(0.5, 2.2); // ≈ 0.21763
    const expectedX = (0.4361 + 0.3851 + 0.1431) * lin;
    const expectedY = (0.2225 + 0.7169 + 0.0606) * lin;
    expect(out[0]).toBeCloseTo(expectedX, 3);
    expect(out[1]).toBeCloseTo(expectedY, 3);
  });
});
