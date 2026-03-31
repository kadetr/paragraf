import { describe, it, expect } from 'vitest';
import { eval1DCurve, evalClutTetrahedral, evalLutMft2 } from '../src/lut';
import type { Mft2Tag } from '../src/profile';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeIdentityClut(gridPoints: number, channels: number): Float64Array {
  // For a 1D CLUT (channels in = channels out), identity: output[i] = input[i]
  // We build an N-D grid where every cell maps to its own normalized coords.
  const total = Math.pow(gridPoints, channels) * channels;
  const clut = new Float64Array(total);
  const gm1 = gridPoints - 1;
  for (let idx = 0; idx < Math.pow(gridPoints, channels); idx++) {
    let rem = idx;
    for (let c = channels - 1; c >= 0; c--) {
      const coord = rem % gridPoints;
      clut[idx * channels + c] = coord / gm1;
      rem = Math.floor(rem / gridPoints);
    }
  }
  return clut;
}

function makeIdentityMft2Tag(gridPoints: number, channels: number): Mft2Tag {
  const n = gridPoints;
  const inputCurves: Float64Array[] = Array.from({ length: channels }, () =>
    Float64Array.from({ length: 256 }, (_, i) => i / 255),
  );
  const outputCurves: Float64Array[] = Array.from({ length: channels }, () =>
    Float64Array.from({ length: 256 }, (_, i) => i / 255),
  );
  return {
    inChannels: channels,
    outChannels: channels,
    gridPoints: n,
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    inputCurves,
    clut: makeIdentityClut(n, channels),
    outputCurves,
  };
}

// ─── eval1DCurve ─────────────────────────────────────────────────────────────

describe('eval1DCurve', () => {
  it('returns 0 for t=0', () => {
    const curve = Float64Array.from([0, 0.5, 1.0]);
    expect(eval1DCurve(curve, 0)).toBeCloseTo(0, 6);
  });

  it('returns 1 for t=1', () => {
    const curve = Float64Array.from([0, 0.5, 1.0]);
    expect(eval1DCurve(curve, 1)).toBeCloseTo(1.0, 6);
  });

  it('interpolates midpoint of a linear curve', () => {
    const curve = Float64Array.from([0, 0.5, 1.0]);
    expect(eval1DCurve(curve, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('interpolates a non-linear curve', () => {
    // Curve maps 0→0, 0.5→0.25, 1→1 (approximates x^2 roughly)
    const curve = Float64Array.from([0, 0.25, 1.0]);
    // At t=0.25, between index 0 and 1: frac=0.5, result = 0 + 0.5*(0.25-0) = 0.125
    expect(eval1DCurve(curve, 0.25)).toBeCloseTo(0.125, 5);
  });

  it('clamps input below 0 to 0', () => {
    const curve = Float64Array.from([0, 0.5, 1.0]);
    expect(eval1DCurve(curve, -0.1)).toBeCloseTo(0, 6);
  });

  it('clamps input above 1 to 1', () => {
    const curve = Float64Array.from([0, 0.5, 1.0]);
    expect(eval1DCurve(curve, 1.1)).toBeCloseTo(1.0, 6);
  });
});

// ─── evalClutTetrahedral ─────────────────────────────────────────────────────

describe('evalClutTetrahedral', () => {
  it('returns identity for identity 3-channel CLUT at corners', () => {
    const g = 3;
    const clut = makeIdentityClut(g, 3);
    expect(evalClutTetrahedral(clut, 3, 3, g, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(evalClutTetrahedral(clut, 3, 3, g, [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('returns identity for midpoint of identity CLUT', () => {
    const g = 3;
    const clut = makeIdentityClut(g, 3);
    const out = evalClutTetrahedral(clut, 3, 3, g, [0.5, 0.5, 0.5]);
    expect(out[0]).toBeCloseTo(0.5, 4);
    expect(out[1]).toBeCloseTo(0.5, 4);
    expect(out[2]).toBeCloseTo(0.5, 4);
  });

  it('identity CLUT passes through arbitrary off-grid point', () => {
    const g = 5;
    const clut = makeIdentityClut(g, 3);
    const input = [0.3, 0.6, 0.1];
    const out = evalClutTetrahedral(clut, 3, 3, g, input);
    expect(out[0]).toBeCloseTo(0.3, 3);
    expect(out[1]).toBeCloseTo(0.6, 3);
    expect(out[2]).toBeCloseTo(0.1, 3);
  });

  it('tetrahedral agrees with trilinear on identity CLUT within 0.002', () => {
    // For identity CLUT, both should give same result (error = 0)
    const g = 3;
    const clut = makeIdentityClut(g, 3);
    for (const input of [
      [0.1, 0.4, 0.7],
      [0.9, 0.2, 0.55],
      [0.33, 0.66, 0.99],
    ] as number[][]) {
      const out = evalClutTetrahedral(clut, 3, 3, g, input);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(out[c] - input[c])).toBeLessThan(0.002);
      }
    }
  });

  it('handles boundary point (1.0) correctly', () => {
    const g = 3;
    const clut = makeIdentityClut(g, 3);
    const out = evalClutTetrahedral(clut, 3, 3, g, [1.0, 0.5, 0.0]);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(0.5, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('handles 4-output channels (RGB→CMYK inversion CLUT)', () => {
    const g = 3;
    const total = Math.pow(g, 3) * 4;
    const clut = new Float64Array(total);
    // Simple test CLUT: C=1-R, M=1-G, Y=1-B, K=0
    for (let ir = 0; ir < g; ir++) {
      for (let ig = 0; ig < g; ig++) {
        for (let ib = 0; ib < g; ib++) {
          const idx = (ir * g * g + ig * g + ib) * 4;
          clut[idx + 0] = 1 - ir / (g - 1); // C = 1-R
          clut[idx + 1] = 1 - ig / (g - 1); // M = 1-G
          clut[idx + 2] = 1 - ib / (g - 1); // Y = 1-B
          clut[idx + 3] = 0; // K = 0
        }
      }
    }
    const out = evalClutTetrahedral(clut, 3, 4, g, [1.0, 0.0, 0.0]);
    expect(out[0]).toBeCloseTo(0.0, 4); // C ≈ 0
    expect(out[1]).toBeCloseTo(1.0, 4); // M ≈ 1
    expect(out[2]).toBeCloseTo(1.0, 4); // Y ≈ 1
    expect(out[3]).toBeCloseTo(0.0, 4); // K = 0
  });
});

// ─── evalLutMft2 ─────────────────────────────────────────────────────────────

describe('evalLutMft2', () => {
  it('returns identity for identity mft2 tag', () => {
    const tag = makeIdentityMft2Tag(5, 3);
    const input = [0.3, 0.6, 0.9];
    const out = evalLutMft2(tag, input);
    expect(out[0]).toBeCloseTo(0.3, 3);
    expect(out[1]).toBeCloseTo(0.6, 3);
    expect(out[2]).toBeCloseTo(0.9, 3);
  });

  it('applies output channel count correctly (3→4)', () => {
    const tag = makeIdentityMft2Tag(3, 3);
    // Rebuild as 3→4 with inversion CLUT
    const g = 3;
    const clutVals = new Float64Array(Math.pow(g, 3) * 4);
    for (let ir = 0; ir < g; ir++) {
      for (let ig2 = 0; ig2 < g; ig2++) {
        for (let ib = 0; ib < g; ib++) {
          const idx = (ir * g * g + ig2 * g + ib) * 4;
          clutVals[idx + 0] = 1 - ir / (g - 1);
          clutVals[idx + 1] = 1 - ig2 / (g - 1);
          clutVals[idx + 2] = 1 - ib / (g - 1);
          clutVals[idx + 3] = 0;
        }
      }
    }
    const tag4: Mft2Tag = {
      inChannels: 3,
      outChannels: 4,
      gridPoints: g,
      matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      inputCurves: tag.inputCurves,
      clut: clutVals,
      outputCurves: Array.from({ length: 4 }, () =>
        Float64Array.from({ length: 256 }, (_, i) => i / 255),
      ),
    };
    const out = evalLutMft2(tag4, [0.0, 1.0, 0.0]);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(1.0, 3); // C = 1-R = 1-0 = 1
    expect(out[1]).toBeCloseTo(0.0, 3); // M = 1-G = 1-1 = 0
    expect(out[2]).toBeCloseTo(1.0, 3); // Y = 1-B = 1-0 = 1
    expect(out[3]).toBeCloseTo(0.0, 3); // K = 0
  });
});
