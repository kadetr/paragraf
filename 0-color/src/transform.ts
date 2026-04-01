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

class LutTransform implements ColorTransform {
  constructor(
    private readonly profile: ColorProfile,
    private readonly lutKey: 'a2b0' | 'b2a0',
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

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an optimised color transform from `source` profile to `dest` profile.
 *
 * Supported paths:
 * - RGB matrix → RGB matrix: source MatrixTrc → dest XYZ (same-space output)
 * - RGB matrix → CMYK LUT: MatrixTrc → XYZ→Lab → B2A0 LUT
 *
 * All output values are normalized to [0, 1].
 */
export function createTransform(
  source: ColorProfile,
  dest: ColorProfile,
  intent: RenderingIntent = 'perceptual',
): ColorTransform {
  const hasSourceMatrix = !!(source.matrix && source.trc);
  const hasDestLut = !!dest.b2a0;

  if (hasSourceMatrix && !hasDestLut) {
    // RGB-matrix → RGB-matrix (or same profile): return matrix+TRC transform
    // Output is CIEXYZ D50. Callers that need device RGB must further process.
    return new MatrixTrcTransform(source);
  }

  if (hasSourceMatrix && hasDestLut) {
    // RGB-matrix → CMYK-LUT: MatrixTrc → XYZ-to-Lab → B2A0
    const matrixStep = new MatrixTrcTransform(source);
    const labStep = new XyzToLabTransform(source.whitePoint ?? D50);
    const lutKey = intent === 'relative' ? 'b2a0' : 'b2a0'; // both use b2a0 for now
    const lutStep = new LutTransform(dest, lutKey);
    return new ChainedTransform([matrixStep, labStep, lutStep]);
  }

  if (!hasSourceMatrix && hasDestLut) {
    // CMYK or LUT-only source: use A2B0 into XYZ/Lab then B2A0 dest
    const srcLut = new LutTransform(source, 'a2b0');
    const dstLut = new LutTransform(dest, 'b2a0');
    return new ChainedTransform([srcLut, dstLut]);
  }

  // Fallback: identity (unknown profile combination)
  return { apply: (v) => [...v] };
}
