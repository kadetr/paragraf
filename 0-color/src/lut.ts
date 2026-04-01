import type { Mft2Tag } from './profile.js';

// ─── 1D curve evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a normalized 1D curve at position t ∈ [0, 1].
 * The curve has `n` entries uniformly spaced over [0, 1].
 * Linear interpolation between neighbouring entries.
 */
export function eval1DCurve(curve: Float64Array, t: number): number {
  if (t <= 0) return curve[0];
  if (t >= 1) return curve[curve.length - 1];
  const n = curve.length;
  const f = t * (n - 1);
  const i = Math.floor(f);
  const frac = f - i;
  if (i >= n - 1) return curve[n - 1];
  return curve[i] * (1 - frac) + curve[i + 1] * frac;
}

// ─── Tetrahedral CLUT interpolation ─────────────────────────────────────────

/**
 * Evaluate an n-dimensional lookup table at `input` using tetrahedral
 * interpolation (per ICC specification §10.8 / Argyll CMS reference).
 *
 * @param clut       Flattened CLUT values in [0, 1].
 *                   Indexed: channel-0 outermost (slowest), channel-(inCh-1) innermost.
 *                   Flat index = (i[0]*g^(n-1) + … + i[n-1]) * outCh + outCh.
 * @param inCh       Number of input channels (must be 3 for tetrahedral path).
 * @param outCh      Number of output channels.
 * @param gridPoints Grid points per axis.
 * @param input      Input values, each in [0, 1].
 */
export function evalClutTetrahedral(
  clut: Float64Array,
  inCh: number,
  outCh: number,
  gridPoints: number,
  input: number[],
): number[] {
  if (inCh !== 3) {
    // Fallback: trilinear for non-3D (not required by Phase 4 plan, but safe)
    return evalClutTrilinear(clut, inCh, outCh, gridPoints, input);
  }

  const g = gridPoints;
  const gm1 = g - 1;

  // Scale input to grid coordinates
  const ax = Math.min(input[0], 1) * gm1;
  const ay = Math.min(input[1], 1) * gm1;
  const az = Math.min(input[2], 1) * gm1;

  // Floor grid indices and fractional parts
  const ix = Math.min(Math.floor(ax), gm1 - 1);
  const iy = Math.min(Math.floor(ay), gm1 - 1);
  const iz = Math.min(Math.floor(az), gm1 - 1);
  const fx = ax - ix;
  const fy = ay - iy;
  const fz = az - iz;

  // Stride for each axis (channel 0 = outermost = slowest)
  const stride0 = g * g * outCh; // axis 0 step
  const stride1 = g * outCh; // axis 1 step
  const stride2 = outCh; // axis 2 step

  const base = ix * stride0 + iy * stride1 + iz * stride2;

  // Helper: retrieve all output channels at a given corner offset
  function corner(d0: number, d1: number, d2: number): Float64Array {
    const off = base + d0 * stride0 + d1 * stride1 + d2 * stride2;
    return clut.subarray(off, off + outCh);
  }

  // Tetrahedral decomposition — 6 cases based on ordering of (fx, fy, fz)
  // Weights always sum to 1; vertex 0=(0,0,0) always first, vertex 3=(1,1,1) always last.
  let w0: number, w1: number, w2: number, w3: number;
  let v1: Float64Array, v2: Float64Array;

  if (fx >= fy && fy >= fz) {
    // fx >= fy >= fz
    w0 = 1 - fx;
    w1 = fx - fy;
    w2 = fy - fz;
    w3 = fz;
    v1 = corner(1, 0, 0);
    v2 = corner(1, 1, 0);
  } else if (fx >= fz && fz >= fy) {
    // fx >= fz >= fy
    w0 = 1 - fx;
    w1 = fx - fz;
    w2 = fz - fy;
    w3 = fy;
    v1 = corner(1, 0, 0);
    v2 = corner(1, 0, 1);
  } else if (fy >= fx && fx >= fz) {
    // fy >= fx >= fz
    w0 = 1 - fy;
    w1 = fy - fx;
    w2 = fx - fz;
    w3 = fz;
    v1 = corner(0, 1, 0);
    v2 = corner(1, 1, 0);
  } else if (fy >= fz && fz >= fx) {
    // fy >= fz >= fx
    w0 = 1 - fy;
    w1 = fy - fz;
    w2 = fz - fx;
    w3 = fx;
    v1 = corner(0, 1, 0);
    v2 = corner(0, 1, 1);
  } else if (fz >= fx && fx >= fy) {
    // fz >= fx >= fy
    w0 = 1 - fz;
    w1 = fz - fx;
    w2 = fx - fy;
    w3 = fy;
    v1 = corner(0, 0, 1);
    v2 = corner(1, 0, 1);
  } else {
    // fz >= fy >= fx
    w0 = 1 - fz;
    w1 = fz - fy;
    w2 = fy - fx;
    w3 = fx;
    v1 = corner(0, 0, 1);
    v2 = corner(0, 1, 1);
  }

  const v0 = corner(0, 0, 0);
  const v3 = corner(1, 1, 1);

  const out = new Array<number>(outCh);
  for (let c = 0; c < outCh; c++) {
    out[c] = w0 * v0[c] + w1 * v1[c] + w2 * v2[c] + w3 * v3[c];
  }
  return out;
}

// ─── Trilinear fallback (for inCh !== 3) ────────────────────────────────────

function evalClutTrilinear(
  clut: Float64Array,
  inCh: number,
  outCh: number,
  gridPoints: number,
  input: number[],
): number[] {
  // Recursive trilinear via successive 1D lerps
  const g = gridPoints;
  const gm1 = g - 1;

  function lerp1D(ch: number, coords: number[]): number[] {
    if (ch === inCh) {
      // Base case: compute flat index from coords
      let idx = 0;
      for (let c = 0; c < inCh; c++) idx = idx * g + coords[c];
      const base = idx * outCh;
      return Array.from(clut.subarray(base, base + outCh));
    }
    const f = Math.min(Math.max(input[ch], 0), 1) * gm1;
    const i0 = Math.min(Math.floor(f), gm1 - 1);
    const i1 = i0 + 1;
    const frac = f - i0;
    const lo = lerp1D(ch + 1, [...coords, i0]);
    const hi = lerp1D(ch + 1, [...coords, i1]);
    return lo.map((v, i) => v * (1 - frac) + hi[i] * frac);
  }

  return lerp1D(0, []);
}

// ─── Full mft2 LUT pipeline ─────────────────────────────────────────────────

/**
 * Evaluate a parsed mft2 LUT tag for the given input channels.
 *
 * Pipeline: [matrix ×] → input curves → CLUT (tetrahedral) → output curves
 *
 * All values in [0, 1].
 */
export function evalLutMft2(tag: Mft2Tag, input: number[]): number[] {
  let vals = [...input];

  // 1. Apply 3×3 matrix (only when inChannels === 3)
  if (tag.inChannels === 3) {
    const m = tag.matrix;
    const [x, y, z] = vals;
    vals = [
      m[0] * x + m[1] * y + m[2] * z,
      m[3] * x + m[4] * y + m[5] * z,
      m[6] * x + m[7] * y + m[8] * z,
    ];
  }

  // 2. Input curves (per channel 1D normalisation)
  vals = vals.map((v, c) =>
    eval1DCurve(tag.inputCurves[c], Math.min(Math.max(v, 0), 1)),
  );

  // 3. CLUT (tetrahedral interpolation)
  vals = evalClutTetrahedral(
    tag.clut,
    tag.inChannels,
    tag.outChannels,
    tag.gridPoints,
    vals,
  );

  // 4. Output curves
  vals = vals.map((v, c) =>
    eval1DCurve(tag.outputCurves[c], Math.min(Math.max(v, 0), 1)),
  );

  return vals;
}
