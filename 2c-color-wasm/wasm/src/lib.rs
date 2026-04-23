use wasm_bindgen::prelude::*;

// ─── Smoke test ──────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn hello(name: &str) -> String {
    format!("hello from color-wasm, {}", name)
}

// ─── TRC helpers ─────────────────────────────────────────────────────────────

/// Apply a simple power-law (gamma) TRC in the forward direction (device → linear).
/// Input is clamped to [0, 1] by the caller.
#[wasm_bindgen]
pub fn apply_gamma_trc(gamma: f64, v: f64) -> f64 {
    if v <= 0.0 {
        return 0.0;
    }
    v.powf(gamma)
}

/// Evaluate a 1D LUT (normalized uniform grid) at position t ∈ [0, 1].
/// Mirrors `eval1DCurve` in lut.ts.
#[wasm_bindgen]
pub fn eval_trc_lut(lut: &[f64], t: f64) -> f64 {
    let n = lut.len();
    if n == 0 {
        return 0.0;
    }
    if t <= 0.0 {
        return lut[0];
    }
    if t >= 1.0 {
        return lut[n - 1];
    }
    let f = t * (n - 1) as f64;
    let i = f.floor() as usize;
    let frac = f - i as f64;
    if i >= n - 1 {
        return lut[n - 1];
    }
    lut[i] * (1.0 - frac) + lut[i + 1] * frac
}

// ─── Matrix-TRC path (RGB → XYZ) ─────────────────────────────────────────────

/// Apply per-channel gamma TRC linearization then a 3×3 matrix multiply.
///
/// `mat` is a 9-element row-major matrix: [r.x, g.x, b.x, r.y, g.y, b.y, r.z, g.z, b.z]
/// where column i is the XYZ tristimulus for the i-th primary.
///
/// Returns [X, Y, Z] in PCS space.
#[wasm_bindgen]
pub fn apply_matrix_gamma_trc(
    gamma_r: f64,
    gamma_g: f64,
    gamma_b: f64,
    mat: &[f64],
    r: f64,
    g: f64,
    b: f64,
) -> Box<[f64]> {
    let r_lin = apply_gamma_trc(gamma_r, r);
    let g_lin = apply_gamma_trc(gamma_g, g);
    let b_lin = apply_gamma_trc(gamma_b, b);

    let x = mat[0] * r_lin + mat[1] * g_lin + mat[2] * b_lin;
    let y = mat[3] * r_lin + mat[4] * g_lin + mat[5] * b_lin;
    let z = mat[6] * r_lin + mat[7] * g_lin + mat[8] * b_lin;

    Box::new([x, y, z])
}

// ─── XYZ → ICC-normalized Lab ─────────────────────────────────────────────────

fn lab_f(t: f64) -> f64 {
    let delta: f64 = 6.0 / 29.0;
    if t > delta.powi(3) {
        t.cbrt()
    } else {
        t / (3.0 * delta * delta) + 4.0 / 29.0
    }
}

/// Convert CIEXYZ (D50-adapted) to ICC-normalized Lab.
/// Convention: L/100, (a+128)/255, (b+128)/255.
/// Mirrors `xyzToIccLab` in transform.ts.
#[wasm_bindgen]
pub fn xyz_to_icc_lab(x: f64, y: f64, z: f64, wp_x: f64, wp_y: f64, wp_z: f64) -> Box<[f64]> {
    let fx = lab_f(x / wp_x);
    let fy = lab_f(y / wp_y);
    let fz = lab_f(z / wp_z);
    let l = 116.0 * fy - 16.0;
    let a = 500.0 * (fx - fy);
    let b = 200.0 * (fy - fz);
    Box::new([l / 100.0, (a + 128.0) / 255.0, (b + 128.0) / 255.0])
}

// ─── Tetrahedral CLUT interpolation ──────────────────────────────────────────

/// Evaluate a 3-input mft2 CLUT using tetrahedral interpolation.
///
/// `clut` is the flattened CLUT data (normalized [0,1]).
/// Indexed: axis-0 outermost (slowest), axis-2 innermost.
/// Flat index = (i0 * g^2 + i1 * g + i2) * out_ch + ch.
///
/// `grid_points` is the number of grid points per axis (g).
/// `out_ch` is the number of output channels.
/// Input (r, g_in, b) must be in [0, 1] (clamped by caller).
///
/// Mirrors `evalClutTetrahedral` (inCh=3 path) in lut.ts.
#[wasm_bindgen]
pub fn eval_clut_tetrahedral(
    clut: &[f64],
    grid_points: usize,
    out_ch: usize,
    r: f64,
    g_in: f64,
    b: f64,
) -> Box<[f64]> {
    let gm1 = grid_points - 1;

    let ax = r.min(1.0) * gm1 as f64;
    let ay = g_in.min(1.0) * gm1 as f64;
    let az = b.min(1.0) * gm1 as f64;

    let ix = (ax.floor() as usize).min(gm1 - 1);
    let iy = (ay.floor() as usize).min(gm1 - 1);
    let iz = (az.floor() as usize).min(gm1 - 1);

    let fx = ax - ix as f64;
    let fy = ay - iy as f64;
    let fz = az - iz as f64;

    let g = grid_points;
    let stride0 = g * g * out_ch;
    let stride1 = g * out_ch;
    let stride2 = out_ch;

    let base = ix * stride0 + iy * stride1 + iz * stride2;

    let corner = |d0: usize, d1: usize, d2: usize| -> &[f64] {
        let off = base + d0 * stride0 + d1 * stride1 + d2 * stride2;
        &clut[off..off + out_ch]
    };

    // Tetrahedral decomposition — 6 cases based on ordering of (fx, fy, fz)
    let (w0, w1, w2, w3, v1, v2): (f64, f64, f64, f64, &[f64], &[f64]);
    let v0 = corner(0, 0, 0);
    let v3 = corner(1, 1, 1);

    if fx >= fy && fy >= fz {
        w0 = 1.0 - fx;
        w1 = fx - fy;
        w2 = fy - fz;
        w3 = fz;
        v1 = corner(1, 0, 0);
        v2 = corner(1, 1, 0);
    } else if fx >= fz && fz >= fy {
        w0 = 1.0 - fx;
        w1 = fx - fz;
        w2 = fz - fy;
        w3 = fy;
        v1 = corner(1, 0, 0);
        v2 = corner(1, 0, 1);
    } else if fz >= fx && fx >= fy {
        w0 = 1.0 - fz;
        w1 = fz - fx;
        w2 = fx - fy;
        w3 = fy;
        v1 = corner(0, 0, 1);
        v2 = corner(1, 0, 1);
    } else if fy >= fx && fx >= fz {
        w0 = 1.0 - fy;
        w1 = fy - fx;
        w2 = fx - fz;
        w3 = fz;
        v1 = corner(0, 1, 0);
        v2 = corner(1, 1, 0);
    } else if fy >= fz && fz >= fx {
        w0 = 1.0 - fy;
        w1 = fy - fz;
        w2 = fz - fx;
        w3 = fx;
        v1 = corner(0, 1, 0);
        v2 = corner(0, 1, 1);
    } else {
        // fz >= fy >= fx
        w0 = 1.0 - fz;
        w1 = fz - fy;
        w2 = fy - fx;
        w3 = fx;
        v1 = corner(0, 0, 1);
        v2 = corner(0, 1, 1);
    }

    let mut out = vec![0.0f64; out_ch];
    for c in 0..out_ch {
        out[c] = w0 * v0[c] + w1 * v1[c] + w2 * v2[c] + w3 * v3[c];
    }

    out.into_boxed_slice()
}

// ─── Inverse matrix and TRC (XYZ → dest device RGB) ──────────────────────────

/// Invert a row-major 3×3 matrix.
/// Input: 9-element row-major array [m00,m01,m02, m10,m11,m12, m20,m21,m22].
/// Output: 9-element row-major inverse.
/// Returns a zero matrix if the determinant is effectively zero.
#[wasm_bindgen]
pub fn invert_matrix_3x3(mat: &[f64]) -> Box<[f64]> {
    let det = mat[0] * (mat[4] * mat[8] - mat[5] * mat[7])
        - mat[1] * (mat[3] * mat[8] - mat[5] * mat[6])
        + mat[2] * (mat[3] * mat[7] - mat[4] * mat[6]);
    if det.abs() < 1e-12 {
        return Box::new([0.0; 9]);
    }
    let d = 1.0 / det;
    Box::new([
        d * (mat[4] * mat[8] - mat[5] * mat[7]),
        d * (mat[2] * mat[7] - mat[1] * mat[8]),
        d * (mat[1] * mat[5] - mat[2] * mat[4]),
        d * (mat[5] * mat[6] - mat[3] * mat[8]),
        d * (mat[0] * mat[8] - mat[2] * mat[6]),
        d * (mat[2] * mat[3] - mat[0] * mat[5]),
        d * (mat[3] * mat[7] - mat[4] * mat[6]),
        d * (mat[1] * mat[6] - mat[0] * mat[7]),
        d * (mat[0] * mat[4] - mat[1] * mat[3]),
    ])
}

/// Apply inverse power-law TRC: linear → device encoding (v^(1/gamma)).
/// Input clamped to [0, 1].
#[wasm_bindgen]
pub fn apply_trc_gamma_inverse(gamma: f64, v: f64) -> f64 {
    if v <= 0.0 {
        return 0.0;
    }
    if v >= 1.0 {
        return 1.0;
    }
    v.powf(1.0 / gamma)
}

/// Apply inverse 1D LUT TRC (binary search): find t ∈ [0,1] such that
/// eval_trc_lut(lut, t) ≈ v. 32-iteration bisection, matching applyTrcInverse in TS.
#[wasm_bindgen]
pub fn apply_trc_lut_inverse(lut: &[f64], v: f64) -> f64 {
    let n = lut.len();
    if n == 0 {
        return 0.0;
    }
    let v_lo = lut[0];
    let v_hi = lut[n - 1];
    let v_c = v.min(v_hi).max(v_lo);
    let mut lo = 0.0f64;
    let mut hi = 1.0f64;
    for _ in 0..32 {
        let mid = (lo + hi) / 2.0;
        // Inline eval_trc_lut
        let f = mid * (n - 1) as f64;
        let i = f.floor() as usize;
        let frac = f - i as f64;
        let val = if i >= n - 1 {
            lut[n - 1]
        } else {
            lut[i] * (1.0 - frac) + lut[i + 1] * frac
        };
        if val < v_c {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    (lo + hi) / 2.0
}
