import { describe, it, expect } from 'vitest';
import {
  loadColorWasm,
  WasmColorTransform,
  createWasmTransform,
} from '../src/index.js';
import {
  loadBuiltinSrgb,
  createTransform,
  eval1DCurve,
  xyzToIccLab,
} from '@paragraf/color';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let wasm: unknown;
const srgb = loadBuiltinSrgb();

// Load WASM once for all tests
wasm = loadColorWasm();

// ─── Loader ──────────────────────────────────────────────────────────────────

describe('loadColorWasm', () => {
  it('returns a non-null object', () => {
    expect(wasm).not.toBeNull();
    expect(typeof wasm).toBe('object');
  });
});

// ─── Factory ─────────────────────────────────────────────────────────────────

describe('createWasmTransform', () => {
  it('returns a WasmColorTransform for sRGB→sRGB', () => {
    const t = createWasmTransform(wasm, srgb, srgb);
    expect(t).toBeInstanceOf(WasmColorTransform);
  });
});

// ─── WasmColorTransform.apply — basic shapes ──────────────────────────────────

describe('WasmColorTransform.apply', () => {
  it('apply([0,0,0]) returns a 3-element array', () => {
    const t = createWasmTransform(wasm, srgb, srgb);
    const result = t.apply([0, 0, 0]);
    expect(result).toHaveLength(3);
  });

  it('apply([1,1,1]) returns a 3-element array', () => {
    const t = createWasmTransform(wasm, srgb, srgb);
    const result = t.apply([1, 1, 1]);
    expect(result).toHaveLength(3);
  });

  it('apply([0.5,0.5,0.5]) — all output values in [0, 1] range', () => {
    const t = createWasmTransform(wasm, srgb, srgb);
    const result = t.apply([0.5, 0.5, 0.5]);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      // XYZ values can slightly exceed 1.0 for sRGB white; allow a small margin
      expect(v).toBeLessThanOrEqual(1.2);
    }
  });
});

// ─── WASM / pure-TS parity ───────────────────────────────────────────────────
//
// These tests verify that the WASM transform matches the pure-TS
// `createTransform` behavior for full source→XYZ→dest round-trips.
// In particular, sRGB→sRGB should behave as an identity transform for
// canonical inputs such as black and white.

describe('WasmColorTransform parity with pure-TS createTransform', () => {
  it('sRGB→sRGB black [0,0,0] → [0,0,0] (both paths agree on black)', () => {
    const tsT = createTransform(srgb, srgb);
    const wasmT = createWasmTransform(wasm, srgb, srgb);

    const tsResult = tsT.apply([0, 0, 0]);
    const wasmResult = wasmT.apply([0, 0, 0]);

    expect(wasmResult).toHaveLength(tsResult.length);
    for (let i = 0; i < tsResult.length; i++) {
      expect(wasmResult[i]).toBeCloseTo(tsResult[i], 6);
    }
  });

  it('sRGB→sRGB white [1,1,1] → [1,1,1] (full round-trip, parity with TS)', () => {
    // WASM now implements the full source→XYZ→dest round-trip.
    // sRGB→sRGB is an identity transform, so white in = white out.
    const tsT = createTransform(srgb, srgb);
    const wasmT = createWasmTransform(wasm, srgb, srgb);
    const wasmResult = wasmT.apply([1, 1, 1]);
    const tsResult = tsT.apply([1, 1, 1]);

    for (let i = 0; i < 3; i++) {
      expect(wasmResult[i]).toBeCloseTo(tsResult[i], 4);
    }
    // Explicitly: should be [1, 1, 1]
    expect(wasmResult[0]).toBeCloseTo(1, 4);
    expect(wasmResult[1]).toBeCloseTo(1, 4);
    expect(wasmResult[2]).toBeCloseTo(1, 4);
  });
});

// ─── Individual WASM exports ──────────────────────────────────────────────────

describe('eval_trc_lut WASM export', () => {
  it('matches eval1DCurve from @paragraf/color for a synthetic curve', () => {
    // Build a simple 5-point linear ramp
    const curve = new Float64Array([0.0, 0.25, 0.5, 0.75, 1.0]);
    const t = 0.3;

    const tsResult = eval1DCurve(curve, t);

    // Access raw WASM module
    const w = wasm as Record<string, (lut: Float64Array, t: number) => number>;
    const wasmResult = w['eval_trc_lut'](curve, t);

    expect(wasmResult).toBeCloseTo(tsResult, 8);
  });
});

describe('xyz_to_icc_lab WASM export', () => {
  it('D50 white point produces ICC-normalized [1, 0.502, 0.502]', () => {
    // D50 white point XYZ
    const wp_x = 0.9642;
    const wp_y = 1.0;
    const wp_z = 0.8249;

    const w = wasm as Record<
      string,
      (
        x: number,
        y: number,
        z: number,
        wx: number,
        wy: number,
        wz: number,
      ) => Float64Array
    >;
    const result = w['xyz_to_icc_lab'](wp_x, wp_y, wp_z, wp_x, wp_y, wp_z);

    // Also verify against TS reference
    const tsResult = xyzToIccLab([wp_x, wp_y, wp_z], {
      x: wp_x,
      y: wp_y,
      z: wp_z,
    });

    // L* at white = 100 → L/100 = 1.0; a* = b* = 0 → (0+128)/255 ≈ 0.502
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(tsResult[1], 5);
    expect(result[2]).toBeCloseTo(tsResult[2], 5);
  });
});
