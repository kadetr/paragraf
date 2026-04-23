/* @ts-self-types="./color_wasm.d.ts" */

/**
 * Apply a simple power-law (gamma) TRC in the forward direction (device → linear).
 * Input is clamped to [0, 1] by the caller.
 * @param {number} gamma
 * @param {number} v
 * @returns {number}
 */
function apply_gamma_trc(gamma, v) {
    const ret = wasm.apply_gamma_trc(gamma, v);
    return ret;
}
exports.apply_gamma_trc = apply_gamma_trc;

/**
 * Apply per-channel gamma TRC linearization then a 3×3 matrix multiply.
 *
 * `mat` is a 9-element row-major matrix: [r.x, g.x, b.x, r.y, g.y, b.y, r.z, g.z, b.z]
 * where column i is the XYZ tristimulus for the i-th primary.
 *
 * Returns [X, Y, Z] in PCS space.
 * @param {number} gamma_r
 * @param {number} gamma_g
 * @param {number} gamma_b
 * @param {Float64Array} mat
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {Float64Array}
 */
function apply_matrix_gamma_trc(gamma_r, gamma_g, gamma_b, mat, r, g, b) {
    const ptr0 = passArrayF64ToWasm0(mat, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.apply_matrix_gamma_trc(gamma_r, gamma_g, gamma_b, ptr0, len0, r, g, b);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}
exports.apply_matrix_gamma_trc = apply_matrix_gamma_trc;

/**
 * Apply inverse power-law TRC: linear → device encoding (v^(1/gamma)).
 * Input clamped to [0, 1].
 * @param {number} gamma
 * @param {number} v
 * @returns {number}
 */
function apply_trc_gamma_inverse(gamma, v) {
    const ret = wasm.apply_trc_gamma_inverse(gamma, v);
    return ret;
}
exports.apply_trc_gamma_inverse = apply_trc_gamma_inverse;

/**
 * Apply inverse 1D LUT TRC (binary search): find t ∈ [0,1] such that
 * eval_trc_lut(lut, t) ≈ v. 32-iteration bisection, matching applyTrcInverse in TS.
 * @param {Float64Array} lut
 * @param {number} v
 * @returns {number}
 */
function apply_trc_lut_inverse(lut, v) {
    const ptr0 = passArrayF64ToWasm0(lut, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.apply_trc_lut_inverse(ptr0, len0, v);
    return ret;
}
exports.apply_trc_lut_inverse = apply_trc_lut_inverse;

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
 * @param {Float64Array} clut
 * @param {number} grid_points
 * @param {number} out_ch
 * @param {number} r
 * @param {number} g_in
 * @param {number} b
 * @returns {Float64Array}
 */
function eval_clut_tetrahedral(clut, grid_points, out_ch, r, g_in, b) {
    const ptr0 = passArrayF64ToWasm0(clut, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.eval_clut_tetrahedral(ptr0, len0, grid_points, out_ch, r, g_in, b);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}
exports.eval_clut_tetrahedral = eval_clut_tetrahedral;

/**
 * Evaluate a 1D LUT (normalized uniform grid) at position t ∈ [0, 1].
 * Mirrors `eval1DCurve` in lut.ts.
 * @param {Float64Array} lut
 * @param {number} t
 * @returns {number}
 */
function eval_trc_lut(lut, t) {
    const ptr0 = passArrayF64ToWasm0(lut, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.eval_trc_lut(ptr0, len0, t);
    return ret;
}
exports.eval_trc_lut = eval_trc_lut;

/**
 * @param {string} name
 * @returns {string}
 */
function hello(name) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hello(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
exports.hello = hello;

/**
 * Invert a row-major 3×3 matrix.
 * Input: 9-element row-major array [m00,m01,m02, m10,m11,m12, m20,m21,m22].
 * Output: 9-element row-major inverse.
 * Returns a zero matrix if the determinant is effectively zero.
 * @param {Float64Array} mat
 * @returns {Float64Array}
 */
function invert_matrix_3x3(mat) {
    const ptr0 = passArrayF64ToWasm0(mat, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.invert_matrix_3x3(ptr0, len0);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}
exports.invert_matrix_3x3 = invert_matrix_3x3;

/**
 * Convert CIEXYZ (D50-adapted) to ICC-normalized Lab.
 * Convention: L/100, (a+128)/255, (b+128)/255.
 * Mirrors `xyzToIccLab` in transform.ts.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} wp_x
 * @param {number} wp_y
 * @param {number} wp_z
 * @returns {Float64Array}
 */
function xyz_to_icc_lab(x, y, z, wp_x, wp_y, wp_z) {
    const ret = wasm.xyz_to_icc_lab(x, y, z, wp_x, wp_y, wp_z);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}
exports.xyz_to_icc_lab = xyz_to_icc_lab;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./color_wasm_bg.js": import0,
    };
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/color_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
wasm.__wbindgen_start();
