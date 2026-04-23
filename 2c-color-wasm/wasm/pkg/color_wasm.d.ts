/* tslint:disable */
/* eslint-disable */

/**
 * Apply a simple power-law (gamma) TRC in the forward direction (device → linear).
 * Input is clamped to [0, 1] by the caller.
 */
export function apply_gamma_trc(gamma: number, v: number): number;

/**
 * Apply per-channel gamma TRC linearization then a 3×3 matrix multiply.
 *
 * `mat` is a 9-element row-major matrix: [r.x, g.x, b.x, r.y, g.y, b.y, r.z, g.z, b.z]
 * where column i is the XYZ tristimulus for the i-th primary.
 *
 * Returns [X, Y, Z] in PCS space.
 */
export function apply_matrix_gamma_trc(gamma_r: number, gamma_g: number, gamma_b: number, mat: Float64Array, r: number, g: number, b: number): Float64Array;

/**
 * Apply inverse power-law TRC: linear → device encoding (v^(1/gamma)).
 * Input clamped to [0, 1].
 */
export function apply_trc_gamma_inverse(gamma: number, v: number): number;

/**
 * Apply inverse 1D LUT TRC (binary search): find t ∈ [0,1] such that
 * eval_trc_lut(lut, t) ≈ v. 32-iteration bisection, matching applyTrcInverse in TS.
 */
export function apply_trc_lut_inverse(lut: Float64Array, v: number): number;

/**
 * Evaluate a 3-input mft2 CLUT using tetrahedral interpolation.
 *
 * `clut` is the flattened CLUT data (normalized [0,1]).
 * Indexed: axis-0 outermost (slowest), axis-2 innermost.
 * Flat index = (i0 * g^2 + i1 * g + i2) * out_ch + ch.
 *
 * `grid_points` is the number of grid points per axis (g).
 * `out_ch` is the number of output channels.
 * Input (r, g_in, b) must be in [0, 1] (clamped by caller).
 *
 * Mirrors `evalClutTetrahedral` (inCh=3 path) in lut.ts.
 */
export function eval_clut_tetrahedral(clut: Float64Array, grid_points: number, out_ch: number, r: number, g_in: number, b: number): Float64Array;

/**
 * Evaluate a 1D LUT (normalized uniform grid) at position t ∈ [0, 1].
 * Mirrors `eval1DCurve` in lut.ts.
 */
export function eval_trc_lut(lut: Float64Array, t: number): number;

export function hello(name: string): string;

/**
 * Invert a row-major 3×3 matrix.
 * Input: 9-element row-major array [m00,m01,m02, m10,m11,m12, m20,m21,m22].
 * Output: 9-element row-major inverse.
 * Returns a zero matrix if the determinant is effectively zero.
 */
export function invert_matrix_3x3(mat: Float64Array): Float64Array;

/**
 * Convert CIEXYZ (D50-adapted) to ICC-normalized Lab.
 * Convention: L/100, (a+128)/255, (b+128)/255.
 * Mirrors `xyzToIccLab` in transform.ts.
 */
export function xyz_to_icc_lab(x: number, y: number, z: number, wp_x: number, wp_y: number, wp_z: number): Float64Array;
