import { evalLutMft2, eval1DCurve } from './lut.js';
import type { ColorProfile, TrcCurve, XYZValue } from './profile.js';
import type { RenderingIntent } from './spaces.js';

// ─── Public interface ────────────────────────────────────────────────────────

/** A compiled color transform. Input and output are normalized channel arrays in [0, 1]. */
export interface ColorTransform {
  apply(input: number[]): number[];
}

// ─── TRC helpers ─────────────────────────────────────────────────────────────

/** Apply a tone reproduction curve in the forward (device → linear) direction. */
export function applyTrcForward(trc: TrcCurve, v: number): number {
  if (trc.kind === 'linear') return v;
  if (trc.kind === 'gamma') {
    if (v <= 0) return 0;
    return Math.pow(v, trc.gamma);
  }
  // kind === 'lut'
  return eval1DCurve(trc.values, Math.min(Math.max(v, 0), 1));
}

/** Apply a tone reproduction curve in the inverse (linear → device) direction. */
export function applyTrcInverse(trc: TrcCurve, v: number): number {
  if (trc.kind === 'linear') return Math.min(Math.max(v, 0), 1);
  if (trc.kind === 'gamma') {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return Math.pow(v, 1 / trc.gamma);
  }
  // kind === 'lut': binary search for t such that eval1DCurve(values, t) ≈ v
  const { values } = trc;
  const n = values.length;
  const vClamped = Math.min(Math.max(v, values[0]), values[n - 1]);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (eval1DCurve(values, mid) < vClamped) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Matrix inversion ────────────────────────────────────────────────────────

type Matrix3x3 = { r: XYZValue; g: XYZValue; b: XYZValue };

/**
 * Invert the 3×3 ICC primary matrix.
 * The ICC matrix is stored as column vectors: M * [R,G,B]^T = [X,Y,Z]^T.
 * Returns M^-1 such that M^-1 * [X,Y,Z]^T = [R_lin, G_lin, B_lin]^T.
 */
function invertMatrix(m: Matrix3x3): Matrix3x3 {
  // Row-major expansion: row0=[r.x,g.x,b.x], row1=[r.y,g.y,b.y], row2=[r.z,g.z,b.z]
  const { r, g, b } = m;
  const det =
    r.x * (g.y * b.z - b.y * g.z) -
    g.x * (r.y * b.z - b.y * r.z) +
    b.x * (r.y * g.z - g.y * r.z);
  if (Math.abs(det) < 1e-12)
    throw new Error('ICC matrix is singular — cannot invert');
  const d = 1 / det;
  // Cofactor matrix transposed / det → gives row-major inverse
  // inv row 0: (c[0][0], c[1][0], c[2][0])
  // but we store as column vectors again: column r of inv = row 0 of inv^T
  // It's easier to return the row-major 3x3 and reinterpret:
  //   inv[row][col] → apply as: R = inv[0][0]*X + inv[0][1]*Y + inv[0][2]*Z
  //                              G = inv[1][0]*X + inv[1][1]*Y + inv[1][2]*Z
  //                              B = inv[2][0]*X + inv[2][1]*Y + inv[2][2]*Z
  // We store as column vectors where "r" column represents X-coefficients for each output channel:
  return {
    r: {
      x: d * (g.y * b.z - b.y * g.z), // inv[0][0]
      y: -d * (r.y * b.z - b.y * r.z), // inv[1][0]
      z: d * (r.y * g.z - g.y * r.z), // inv[2][0]
    },
    g: {
      x: -d * (g.x * b.z - b.x * g.z), // inv[0][1]
      y: d * (r.x * b.z - b.x * r.z), // inv[1][1]
      z: -d * (r.x * g.z - g.x * r.z), // inv[2][1]
    },
    b: {
      x: d * (g.x * b.y - b.x * g.y), // inv[0][2]
      y: -d * (r.x * b.y - b.x * r.y), // inv[1][2]
      z: d * (r.x * g.y - g.x * r.y), // inv[2][2]
    },
  };
}

// ─── XYZ ↔ Lab conversion ────────────────────────────────────────────────────

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

/**
 * Convert CIEXYZ (D50-adapted) to ICC-normalized Lab [0, 1].
 * L/100, (a+128)/255, (b+128)/255 — the convention used as mft2 B2A0 input.
 */
export function xyzToIccLab(xyz: number[], wp: XYZValue): number[] {
  const fx = labF(xyz[0] / wp.x);
  const fy = labF(xyz[1] / wp.y);
  const fz = labF(xyz[2] / wp.z);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L / 100, (a + 128) / 255, (b + 128) / 255];
}

// ─── Transform implementations ───────────────────────────────────────────────

class MatrixTrcTransform implements ColorTransform {
  constructor(private readonly profile: ColorProfile) {}

  apply(input: number[]): number[] {
    const { matrix, trc } = this.profile;
    if (!matrix || !trc)
      throw new Error('MatrixTrcTransform requires matrix + TRC profile');

    const rLin = applyTrcForward(trc[0], input[0]);
    const gLin = applyTrcForward(trc[1], input[1]);
    const bLin = applyTrcForward(trc[2], input[2]);

    return [
      matrix.r.x * rLin + matrix.g.x * gLin + matrix.b.x * bLin,
      matrix.r.y * rLin + matrix.g.y * gLin + matrix.b.y * bLin,
      matrix.r.z * rLin + matrix.g.z * gLin + matrix.b.z * bLin,
    ];
  }
}

/** Inverse direction: XYZ (PCS) → destination device RGB. */
class MatrixTrcInverseTransform implements ColorTransform {
  private readonly invMatrix: Matrix3x3;
  constructor(private readonly profile: ColorProfile) {
    if (!profile.matrix || !profile.trc)
      throw new Error(
        'MatrixTrcInverseTransform requires matrix + TRC profile',
      );
    this.invMatrix = invertMatrix(profile.matrix);
  }

  apply(xyz: number[]): number[] {
    const { invMatrix, profile } = this;
    // XYZ → linear RGB via inverse matrix
    // Note: invMatrix columns are X-col, Y-col, Z-col for each output channel.
    // R_lin = invMatrix.r.x*X + invMatrix.g.x*Y + invMatrix.b.x*Z
    // G_lin = invMatrix.r.y*X + invMatrix.g.y*Y + invMatrix.b.y*Z
    // B_lin = invMatrix.r.z*X + invMatrix.g.z*Y + invMatrix.b.z*Z
    const X = xyz[0] ?? 0;
    const Y = xyz[1] ?? 0;
    const Z = xyz[2] ?? 0;
    const rLin = invMatrix.r.x * X + invMatrix.g.x * Y + invMatrix.b.x * Z;
    const gLin = invMatrix.r.y * X + invMatrix.g.y * Y + invMatrix.b.y * Z;
    const bLin = invMatrix.r.z * X + invMatrix.g.z * Y + invMatrix.b.z * Z;
    // Clamp linear values before inverse-TRC encoding
    const trc = profile.trc!;
    return [
      applyTrcInverse(trc[0], Math.min(Math.max(rLin, 0), 1)),
      applyTrcInverse(trc[1], Math.min(Math.max(gLin, 0), 1)),
      applyTrcInverse(trc[2], Math.min(Math.max(bLin, 0), 1)),
    ];
  }
}

class LutTransform implements ColorTransform {
  constructor(
    private readonly profile: ColorProfile,
    private readonly lutKey: 'a2b0' | 'b2a0' | 'b2a1' | 'b2a2',
  ) {}

  apply(input: number[]): number[] {
    const tag = this.profile[this.lutKey];
    if (!tag)
      throw new Error(
        `LutTransform: ${this.lutKey} tag not present on profile`,
      );
    return evalLutMft2(tag, input);
  }
}

class XyzToLabTransform implements ColorTransform {
  constructor(private readonly whitePoint: XYZValue) {}
  apply(input: number[]): number[] {
    return xyzToIccLab(input, this.whitePoint);
  }
}

class ChainedTransform implements ColorTransform {
  constructor(private readonly steps: ColorTransform[]) {}
  apply(input: number[]): number[] {
    return this.steps.reduce((v, t) => t.apply(v), input);
  }
}

// ─── D50 white point (ICC PCS illuminant) ────────────────────────────────────

const D50: XYZValue = { x: 0.9642, y: 1.0, z: 0.8249 };

// ─── Bradford chromatic adaptation (#32) ─────────────────────────────────────

/**
 * Build a 3×3 Bradford chromatic adaptation matrix (row-major flat array)
 * that converts XYZ from `srcWP` to `dstWP`.
 */
function buildBradfordCat(srcWP: XYZValue, dstWP: XYZValue): number[] {
  // Bradford cone matrix (row-major)
  const Mb = [
    0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
  ];
  // Bradford cone matrix inverse (row-major)
  const MbInv = [
    0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912,
    -0.0085287, 0.0400428, 0.9684867,
  ];

  // Cone responses for source and destination white points
  const sR = Mb[0] * srcWP.x + Mb[1] * srcWP.y + Mb[2] * srcWP.z;
  const sG = Mb[3] * srcWP.x + Mb[4] * srcWP.y + Mb[5] * srcWP.z;
  const sB = Mb[6] * srcWP.x + Mb[7] * srcWP.y + Mb[8] * srcWP.z;
  const dR = Mb[0] * dstWP.x + Mb[1] * dstWP.y + Mb[2] * dstWP.z;
  const dG = Mb[3] * dstWP.x + Mb[4] * dstWP.y + Mb[5] * dstWP.z;
  const dB = Mb[6] * dstWP.x + Mb[7] * dstWP.y + Mb[8] * dstWP.z;

  // Scale factors (avoid division by zero)
  const sr = sR !== 0 ? dR / sR : 1;
  const sg = sG !== 0 ? dG / sG : 1;
  const sb = sB !== 0 ? dB / sB : 1;

  // M_cat = MbInv * diag([sr, sg, sb]) * Mb
  // diag * Mb: scale rows of Mb
  const scaled = [
    sr * Mb[0],
    sr * Mb[1],
    sr * Mb[2],
    sg * Mb[3],
    sg * Mb[4],
    sg * Mb[5],
    sb * Mb[6],
    sb * Mb[7],
    sb * Mb[8],
  ];
  // MbInv * scaled (3×3 multiply)
  const cat: number[] = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cat[r * 3 + c] =
        MbInv[r * 3 + 0] * scaled[0 * 3 + c] +
        MbInv[r * 3 + 1] * scaled[1 * 3 + c] +
        MbInv[r * 3 + 2] * scaled[2 * 3 + c];
    }
  }
  return cat;
}

/** True when two white points are close enough that adaptation is a no-op. */
function whitePointsMatch(a: XYZValue, b: XYZValue, tol = 1e-4): boolean {
  return (
    Math.abs(a.x - b.x) < tol &&
    Math.abs(a.y - b.y) < tol &&
    Math.abs(a.z - b.z) < tol
  );
}

class BradfordAdaptTransform implements ColorTransform {
  private readonly cat: number[];
  constructor(srcWP: XYZValue, dstWP: XYZValue) {
    this.cat = buildBradfordCat(srcWP, dstWP);
  }
  apply(xyz: number[]): number[] {
    const [X, Y, Z] = xyz;
    const m = this.cat;
    return [
      m[0] * X + m[1] * Y + m[2] * Z,
      m[3] * X + m[4] * Y + m[5] * Z,
      m[6] * X + m[7] * Y + m[8] * Z,
    ];
  }
}

// ─── Intent-based LUT key selection (#30) ────────────────────────────────────

/**
 * Return the best available B2A LUT key for the given rendering intent.
 * Falls back to `b2a0` (perceptual) when the intent-specific LUT is absent.
 */
function b2aKeyForIntent(
  intent: RenderingIntent,
  dest: ColorProfile,
): 'b2a0' | 'b2a1' | 'b2a2' {
  if (intent === 'relative' || intent === 'absolute') {
    return dest.b2a1 ? 'b2a1' : 'b2a0';
  }
  if (intent === 'saturation') {
    return dest.b2a2 ? 'b2a2' : 'b2a0';
  }
  // 'perceptual' or default
  return 'b2a0';
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an optimised color transform from `source` profile to `dest` profile.
 *
 * Supported paths:
 * - RGB matrix → RGB matrix: source MatrixTrc → dest inverse MatrixTrc (full device round-trip)
 * - RGB matrix → LUT destination (e.g. CMYK): MatrixTrc [→ Bradford] [→ XYZ→Lab] → B2Ax LUT
 * - LUT-only source → LUT destination: A2B0 → B2Ax LUT
 *
 * All output values are normalized to [0, 1] in the destination device colorspace.
 */
export function createTransform(
  source: ColorProfile,
  dest: ColorProfile,
  intent: RenderingIntent = 'perceptual',
): ColorTransform {
  const hasSourceMatrix = !!(source.matrix && source.trc);
  const hasDestLut = !!dest.b2a0;

  if (hasSourceMatrix && !hasDestLut) {
    // RGB-matrix → RGB-matrix: full round-trip source→XYZ→dest
    const forwardStep = new MatrixTrcTransform(source);
    if (dest.matrix && dest.trc) {
      const inverseStep = new MatrixTrcInverseTransform(dest);
      return new ChainedTransform([forwardStep, inverseStep]);
    }
    // dest has no matrix (unusual) — return XYZ as before
    return forwardStep;
  }

  if (hasSourceMatrix && hasDestLut) {
    // RGB-matrix → LUT destination (e.g. CMYK)
    const steps: ColorTransform[] = [new MatrixTrcTransform(source)];

    // #32: Bradford chromatic adaptation when source white point differs from D50
    const srcWP = source.whitePoint ?? D50;
    if (!whitePointsMatch(srcWP, D50)) {
      steps.push(new BradfordAdaptTransform(srcWP, D50));
    }

    // #31: XYZ→Lab only when destination PCS is Lab
    if (dest.pcs === 'Lab') {
      steps.push(new XyzToLabTransform(D50));
    }

    // #30: Select B2A LUT based on rendering intent, fall back to b2a0
    steps.push(new LutTransform(dest, b2aKeyForIntent(intent, dest)));

    return new ChainedTransform(steps);
  }

  if (!hasSourceMatrix && hasDestLut) {
    // LUT-only source: A2B0 into PCS then B2Ax dest
    const srcLut = new LutTransform(source, 'a2b0');
    const dstLut = new LutTransform(dest, b2aKeyForIntent(intent, dest));
    return new ChainedTransform([srcLut, dstLut]);
  }

  // Fallback: identity (unknown profile combination)
  return { apply: (v) => [...v] };
}
