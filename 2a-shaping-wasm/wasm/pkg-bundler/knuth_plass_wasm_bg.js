/**
 * Analyse `text` into Unicode BiDi runs (auto-detected paragraph level).
 *
 * Run boundaries are snapped to grapheme cluster boundaries.  In practice the
 * UBA already handles Non-Spacing Marks (Arabic harakat, Hebrew nikud) via
 * rule W1, so the snap is a safety net for unusual edge cases.
 *
 * Returns `{ ok: [ { text, level, isRtl }, … ] }` or `{ error: "…" }`.
 * @param {string} text
 * @returns {string}
 */
export function analyze_bidi(text) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.analyze_bidi(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Extended BiDi analysis: paragraph base level (P2/P3 first-strong), logical
 * runs, and a visual reorder map derived from the UBA L2 algorithm.
 *
 * Returns:
 * ```json
 * { "ok": { "paragraphLevel": 0|1, "paragraphDirection": "ltr"|"rtl",
 *           "runs": [{"text","level","isRtl"}],
 *           "reorderMap": [<logical run index at visual position 0>, …] } }
 * ```
 * or `{ "error": "…" }`.
 *
 * `reorderMap[i]` is the logical run index that should be rendered at visual
 * position `i`.  For LTR text it is the identity permutation.
 * @param {string} text
 * @returns {string}
 */
export function analyze_bidi_v2(text) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.analyze_bidi_v2(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run the full Knuth-Plass forward pass (with multi-pass tolerance ladder) on
 * a serialized ParagraphInput and return JSON.
 *
 * **Infinity convention:** TypeScript's `FORCED_BREAK` (-Infinity) and
 * `PROHIBITED` (+Infinity) are not valid JSON.  The caller must replace them
 * with the finite sentinels `-1e30` / `1e30` before serialising.
 *
 * Returns `{ ok: { active, usedEmergency, optimalIndex } }` on success or
 * `{ error: "..." }` on failure.
 * @param {string} input_json
 * @returns {string}
 */
export function compute_breakpoints_wasm(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.compute_breakpoints_wasm(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Create and register a parsed face from raw bytes, returning an opaque u32 handle.
 * @param {Uint8Array} data
 * @returns {number}
 */
export function create_face(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.create_face(ptr0, len0);
    return ret >>> 0;
}

/**
 * Drop a registered face by handle. Unknown IDs are ignored with a warning.
 * @param {number} id
 */
export function drop_face(id) {
    wasm.drop_face(id);
}

/**
 * OS/2 font metrics scaled to pt. Mirrors TypeScript `realMetrics`.
 * Uses sTypo* values with hhea fallback; baseline shift from ySuperscriptYOffset /
 * ySubscriptYOffset when Font.variant is set.
 *
 * Returns `{ ok: { unitsPerEm, ascender, descender, xHeight, capHeight, lineGap, baselineShift } }`
 * or `{ error: "..." }`.
 * @param {string} font_json
 * @returns {string}
 */
export function font_metrics_wasm(font_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(font_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.font_metrics_wasm(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Extract the outline path for a single glyph at position (x, y) scaled to fontSize.
 * Y-flip is applied: font-space Y (up) -> screen-space Y (down).
 *
 * Returns `{ ok: { commands: PathCommand[], d: string } }` or `{ error: "..." }`.
 * @param {string} font_id
 * @param {number} glyph_id
 * @param {number} x
 * @param {number} y
 * @param {number} font_size
 * @returns {string}
 */
export function get_glyph_path(font_id, glyph_id, x, y, font_size) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(font_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.get_glyph_path(ptr0, len0, glyph_id, x, y, font_size);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} name
 * @returns {string}
 */
export function hello(name) {
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

/**
 * Measure the advance width of `text` in pt, applying GSUB (liga, sups/subs) and GPOS kern.
 * Mirrors TypeScript `realMeasure`: letterSpacing added between glyphs, not after the last one.
 *
 * Returns `{ ok: { width: number } }` or `{ error: "..." }`.
 * @param {string} text
 * @param {string} font_json
 * @returns {string}
 */
export function measure_text_wasm(text, font_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(font_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.measure_text_wasm(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Register a font's raw bytes under `font_id` in the WASM-local cache.
 * Call once at startup for each font file used by the paragraph composer.
 * @param {string} font_id
 * @param {Uint8Array} data
 */
export function register_font(font_id, data) {
    const ptr0 = passStringToWasm0(font_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.register_font(ptr0, len0, ptr1, len1);
}

/**
 * Deserialize a single Node from JSON and re-serialize it.
 * Used by tests to verify the TypeScript ↔ Rust JSON contract.
 * @param {string} node_json
 * @returns {string}
 */
export function round_trip_node(node_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(node_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.round_trip_node(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Deserialize a full ParagraphInput from JSON and re-serialize it.
 * Used by tests to verify the TypeScript ↔ Rust JSON contract.
 * @param {string} input_json
 * @returns {string}
 */
export function round_trip_paragraph(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.round_trip_paragraph(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Shape `text` and return per-glyph info in font units.
 * Applies GSUB features (liga, rlig, sups/subs via Font.variant) and GPOS kern.
 * Values are in font units so callers scale with `fontSize / unitsPerEm`.
 *
 * Returns `{ ok: { glyphs: ShapedGlyph[], unitsPerEm: number } }` or `{ error: "..." }`.
 * @param {string} text
 * @param {string} font_json
 * @returns {string}
 */
export function shape_text_wasm(text, font_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(font_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.shape_text_wasm(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Shape text using a previously created face handle.
 * Returns `{ ok: { glyphs, unitsPerEm } }` or `{ error: "..." }`.
 * @param {number} id
 * @param {string} text
 * @param {string} font_json
 * @returns {string}
 */
export function shape_with_face(id, text, font_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(font_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.shape_with_face(id, ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Space glyph metrics in pt: natural width, stretch, shrink.
 * Mirrors TypeScript `realSpace`: width = raw space advance (fallback em/3),
 * stretch = em/6, shrink = em/9.
 *
 * Returns `{ ok: { width, stretch, shrink } }` or `{ error: "..." }`.
 * @param {string} font_json
 * @returns {string}
 */
export function space_metrics_wasm(font_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(font_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.space_metrics_wasm(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run the forward pass and traceback, returning an ordered `LineBreak[]`.
 *
 * Input JSON shape is identical to `compute_breakpoints_wasm`.
 * Returns `{ ok: { breaks: [...] } }` or `{ error: "..." }`.
 * @param {string} input_json
 * @returns {string}
 */
export function traceback_wasm(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.traceback_wasm(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run the forward pass and traceback using binary node format.
 * Returns `{ ok: { breaks: [...], usedEmergency: bool } }` or `{ error: "..." }`.
 *
 * f64s: [width, p1, p2, p3, ...] (4 f64 per node)
 * u8s: [type_and_flags, ...] (type in lower 4 bits, flags in upper 4 bits)
 * @param {Float64Array} f64s
 * @param {Uint8Array} u8s
 * @param {Float64Array} line_widths_f64
 * @param {number} line_width
 * @param {number} tolerance
 * @param {number} emergency_stretch
 * @param {number} looseness
 * @param {number} widow_penalty
 * @param {number} orphan_penalty
 * @param {number} consecutive_hyphen_limit
 * @returns {string}
 */
export function traceback_wasm_binary(f64s, u8s, line_widths_f64, line_width, tolerance, emergency_stretch, looseness, widow_penalty, orphan_penalty, consecutive_hyphen_limit) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passArrayF64ToWasm0(f64s, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(u8s, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(line_widths_f64, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.traceback_wasm_binary(ptr0, len0, ptr1, len1, ptr2, len2, line_width, tolerance, emergency_stretch, looseness, widow_penalty, orphan_penalty, consecutive_hyphen_limit);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
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


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
