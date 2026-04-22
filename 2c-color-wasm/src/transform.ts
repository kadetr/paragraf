import {
  createTransform,
  type ColorProfile,
  type ColorTransform,
  type RenderingIntent,
  type TrcCurve,
  type XYZValue,
} from '@paragraf/color';

// ─── WASM module interface ────────────────────────────────────────────────────

/** Shape of the wasm-bindgen JS module produced by wasm-pack. */
interface ColorWasmModule {
  apply_gamma_trc(gamma: number, v: number): number;
  apply_matrix_gamma_trc(
    gamma_r: number,
    gamma_g: number,
    gamma_b: number,
    mat: Float64Array,
    r: number,
    g: number,
    b: number,
  ): Float64Array;
  eval_trc_lut(lut: Float64Array, t: number): number;
  xyz_to_icc_lab(
    x: number,
    y: number,
    z: number,
    wp_x: number,
    wp_y: number,
    wp_z: number,
  ): Float64Array;
  eval_clut_tetrahedral(
    clut: Float64Array,
    grid_points: number,
    out_ch: number,
    r: number,
    g_in: number,
    b: number,
  ): Float64Array;
  invert_matrix_3x3(mat: Float64Array): Float64Array;
  apply_trc_gamma_inverse(gamma: number, v: number): number;
  apply_trc_lut_inverse(lut: Float64Array, v: number): number;
}

// ─── Compiled plan types ──────────────────────────────────────────────────────

type TrcStep =
  | { kind: 'linear' }
  | { kind: 'gamma'; gamma: number }
  | { kind: 'lut'; values: Float64Array };

type CompiledPlan =
  | {
      path: 'matrix-trc';
      trc: [TrcStep, TrcStep, TrcStep];
      mat: Float64Array;
      /** When dest has a matrix+TRC, these drive the XYZ→dest inverse step. */
      destInvMat?: Float64Array;
      destTrc?: [TrcStep, TrcStep, TrcStep];
    }
  | {
      path: 'matrix-trc-lut';
      trc: [TrcStep, TrcStep, TrcStep];
      mat: Float64Array;
      wp: [number, number, number];
      clut: Float64Array;
      gridPoints: number;
      outCh: number;
    }
  | { path: 'fallback'; delegate: ColorTransform };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const D50: XYZValue = { x: 0.9642, y: 1.0, z: 0.8249 };

function toTrcStep(trc: TrcCurve): TrcStep {
  if (trc.kind === 'linear') return { kind: 'linear' };
  if (trc.kind === 'gamma') return { kind: 'gamma', gamma: trc.gamma };
  return { kind: 'lut', values: trc.values };
}

function buildMatArray(profile: ColorProfile): Float64Array {
  const { r, g, b } = profile.matrix!;
  return new Float64Array([r.x, g.x, b.x, r.y, g.y, b.y, r.z, g.z, b.z]);
}

// ─── WasmColorTransform ───────────────────────────────────────────────────────

/**
 * WASM-accelerated color transform. Implements the same `ColorTransform`
 * interface as `createTransform` from `@paragraf/color`. Drop-in replacement
 * for the matrix-TRC and matrix-TRC-LUT paths.
 *
 * For unsupported profile combinations (e.g. CMYK source with A2B0 LUT),
 * the instance delegates to the pure-TS `createTransform` automatically.
 */
export class WasmColorTransform implements ColorTransform {
  constructor(
    private readonly wasm: ColorWasmModule,
    private readonly plan: CompiledPlan,
  ) {}

  apply(input: number[]): number[] {
    const { plan, wasm } = this;

    if (plan.path === 'fallback') {
      return plan.delegate.apply(input);
    }

    // Apply TRC linearization per channel
    const applyTrc = (trc: TrcStep, v: number): number => {
      const clamped = Math.min(Math.max(v, 0), 1);
      if (trc.kind === 'linear') return clamped;
      if (trc.kind === 'gamma') return wasm.apply_gamma_trc(trc.gamma, clamped);
      return wasm.eval_trc_lut(trc.values, clamped);
    };

    const [t0, t1, t2] = plan.trc;
    const r = applyTrc(t0, input[0]);
    const g = applyTrc(t1, input[1]);
    const b = applyTrc(t2, input[2]);

    // Matrix multiply: RGB linear → XYZ
    const xyz = wasm.apply_matrix_gamma_trc(
      1.0,
      1.0,
      1.0, // gammas already applied above; use identity (linear passthrough)
      plan.mat,
      r,
      g,
      b,
    );

    if (plan.path === 'matrix-trc') {
      if (plan.destInvMat && plan.destTrc) {
        // Inverse step: XYZ → dest linear RGB via inverse matrix
        const inv = plan.destInvMat;
        const X = xyz[0] ?? 0;
        const Y = xyz[1] ?? 0;
        const Z = xyz[2] ?? 0;
        const rLin = Math.min(
          Math.max(inv[0] * X + inv[1] * Y + inv[2] * Z, 0),
          1,
        );
        const gLin = Math.min(
          Math.max(inv[3] * X + inv[4] * Y + inv[5] * Z, 0),
          1,
        );
        const bLin = Math.min(
          Math.max(inv[6] * X + inv[7] * Y + inv[8] * Z, 0),
          1,
        );
        // Apply inverse TRC: linear → dest device encoding
        const applyTrcInv = (trc: TrcStep, v: number): number => {
          if (trc.kind === 'linear') return v;
          if (trc.kind === 'gamma')
            return wasm.apply_trc_gamma_inverse(trc.gamma, v);
          return wasm.apply_trc_lut_inverse(trc.values, v);
        };
        const [dt0, dt1, dt2] = plan.destTrc;
        return [
          applyTrcInv(dt0, rLin),
          applyTrcInv(dt1, gLin),
          applyTrcInv(dt2, bLin),
        ];
      }
      return [xyz[0], xyz[1], xyz[2]];
    }

    // matrix-trc-lut path: XYZ → ICC Lab → CLUT → output channels
    const [wp_x, wp_y, wp_z] = plan.wp;
    const lab = wasm.xyz_to_icc_lab(xyz[0], xyz[1], xyz[2], wp_x, wp_y, wp_z);

    const out = wasm.eval_clut_tetrahedral(
      plan.clut,
      plan.gridPoints,
      plan.outCh,
      lab[0],
      lab[1],
      lab[2],
    );
    return Array.from(out);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a `WasmColorTransform` from `source` to `dest` profile.
 *
 * Accelerated paths:
 * - RGB matrix → RGB matrix: matrix-TRC (WASM)
 * - RGB matrix → CMYK/LUT:   matrix-TRC + XYZ→Lab + CLUT (WASM)
 *
 * Unsupported paths (e.g. CMYK source) fall back to the pure-TS
 * `createTransform` from `@paragraf/color` automatically.
 *
 * @param wasm   The wasm module returned by `loadColorWasm()`.
 * @param source Source ICC profile.
 * @param dest   Destination ICC profile.
 * @param intent Rendering intent (default: `'perceptual'`).
 */
export function createWasmTransform(
  wasm: unknown,
  source: ColorProfile,
  dest: ColorProfile,
  intent: RenderingIntent = 'perceptual',
): WasmColorTransform {
  const w = wasm as ColorWasmModule;
  const hasSourceMatrix = !!(source.matrix && source.trc);
  const hasDestLut = !!dest.b2a0;

  if (hasSourceMatrix && !hasDestLut) {
    // RGB matrix → RGB matrix: full round-trip source→XYZ→dest
    const trc = source.trc!;
    const plan: CompiledPlan = {
      path: 'matrix-trc',
      trc: [toTrcStep(trc[0]), toTrcStep(trc[1]), toTrcStep(trc[2])],
      mat: buildMatArray(source),
    };
    if (dest.matrix && dest.trc) {
      // Pre-compute inverse of dest matrix via WASM
      plan.destInvMat = w.invert_matrix_3x3(buildMatArray(dest));
      plan.destTrc = [
        toTrcStep(dest.trc[0]),
        toTrcStep(dest.trc[1]),
        toTrcStep(dest.trc[2]),
      ];
    }
    return new WasmColorTransform(w, plan);
  }

  if (hasSourceMatrix && hasDestLut) {
    // RGB matrix → CMYK LUT: matrix-TRC + XYZ→Lab + B2A0 CLUT path
    const trc = source.trc!;
    const wp = source.whitePoint ?? D50;
    const b2a0 = dest.b2a0!;
    const plan: CompiledPlan = {
      path: 'matrix-trc-lut',
      trc: [toTrcStep(trc[0]), toTrcStep(trc[1]), toTrcStep(trc[2])],
      mat: buildMatArray(source),
      wp: [wp.x, wp.y, wp.z],
      clut: new Float64Array(b2a0.clut),
      gridPoints: b2a0.gridPoints,
      outCh: b2a0.outChannels,
    };
    return new WasmColorTransform(w, plan);
  }

  // Unsupported profile combination — delegate to pure-TS
  const delegate = createTransform(source, dest, intent);
  return new WasmColorTransform(w, { path: 'fallback', delegate });
}
