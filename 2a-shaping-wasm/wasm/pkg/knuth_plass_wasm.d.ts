/* tslint:disable */
/* eslint-disable */

/**
 * Analyse `text` into Unicode BiDi runs (auto-detected paragraph level).
 *
 * Run boundaries are snapped to grapheme cluster boundaries.  In practice the
 * UBA already handles Non-Spacing Marks (Arabic harakat, Hebrew nikud) via
 * rule W1, so the snap is a safety net for unusual edge cases.
 *
 * Returns `{ ok: [ { text, level, isRtl }, … ] }` or `{ error: "…" }`.
 */
export function analyze_bidi(text: string): string;

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
 */
export function analyze_bidi_v2(text: string): string;

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
 */
export function compute_breakpoints_wasm(input_json: string): string;

/**
 * Create and register a parsed face from raw bytes, returning an opaque u32 handle.
 */
export function create_face(data: Uint8Array): number;

/**
 * Drop a registered face by handle. Unknown IDs are ignored with a warning.
 */
export function drop_face(id: number): void;

/**
 * OS/2 font metrics scaled to pt. Mirrors TypeScript `realMetrics`.
 * Uses sTypo* values with hhea fallback; baseline shift from ySuperscriptYOffset /
 * ySubscriptYOffset when Font.variant is set.
 *
 * Returns `{ ok: { unitsPerEm, ascender, descender, xHeight, capHeight, lineGap, baselineShift } }`
 * or `{ error: "..." }`.
 */
export function font_metrics_wasm(font_json: string): string;

/**
 * Extract the outline path for a single glyph at position (x, y) scaled to fontSize.
 * Y-flip is applied: font-space Y (up) -> screen-space Y (down).
 *
 * Returns `{ ok: { commands: PathCommand[], d: string } }` or `{ error: "..." }`.
 */
export function get_glyph_path(font_id: string, glyph_id: number, x: number, y: number, font_size: number): string;

export function hello(name: string): string;

/**
 * Measure the advance width of `text` in pt, applying GSUB (liga, sups/subs) and GPOS kern.
 * Mirrors TypeScript `realMeasure`: letterSpacing added between glyphs, not after the last one.
 *
 * Returns `{ ok: { width: number } }` or `{ error: "..." }`.
 */
export function measure_text_wasm(text: string, font_json: string): string;

/**
 * Register a font's raw bytes under `font_id` in the WASM-local cache.
 * Call once at startup for each font file used by the paragraph composer.
 */
export function register_font(font_id: string, data: Uint8Array): void;

/**
 * Deserialize a single Node from JSON and re-serialize it.
 * Used by tests to verify the TypeScript ↔ Rust JSON contract.
 */
export function round_trip_node(node_json: string): string;

/**
 * Deserialize a full ParagraphInput from JSON and re-serialize it.
 * Used by tests to verify the TypeScript ↔ Rust JSON contract.
 */
export function round_trip_paragraph(input_json: string): string;

/**
 * Shape `text` and return per-glyph info in font units.
 * Applies GSUB features (liga, rlig, sups/subs via Font.variant) and GPOS kern.
 * Values are in font units so callers scale with `fontSize / unitsPerEm`.
 *
 * Returns `{ ok: { glyphs: ShapedGlyph[], unitsPerEm: number } }` or `{ error: "..." }`.
 */
export function shape_text_wasm(text: string, font_json: string): string;

/**
 * Shape text using a previously created face handle.
 * Returns `{ ok: { glyphs, unitsPerEm } }` or `{ error: "..." }`.
 */
export function shape_with_face(id: number, text: string, font_json: string): string;

/**
 * Space glyph metrics in pt: natural width, stretch, shrink.
 * Mirrors TypeScript `realSpace`: width = raw space advance (fallback em/3),
 * stretch = em/6, shrink = em/9.
 *
 * Returns `{ ok: { width, stretch, shrink } }` or `{ error: "..." }`.
 */
export function space_metrics_wasm(font_json: string): string;

/**
 * Run the forward pass and traceback, returning an ordered `LineBreak[]`.
 *
 * Input JSON shape is identical to `compute_breakpoints_wasm`.
 * Returns `{ ok: { breaks: [...] } }` or `{ error: "..." }`.
 */
export function traceback_wasm(input_json: string): string;

/**
 * Run the forward pass and traceback using binary node format.
 * Returns `{ ok: { breaks: [...], usedEmergency: bool } }` or `{ error: "..." }`.
 *
 * f64s: [width, p1, p2, p3, ...] (4 f64 per node)
 * u8s: [type_and_flags, ...] (type in lower 4 bits, flags in upper 4 bits)
 */
export function traceback_wasm_binary(f64s: Float64Array, u8s: Uint8Array, line_widths_f64: Float64Array, line_width: number, tolerance: number, emergency_stretch: number, looseness: number, widow_penalty: number, orphan_penalty: number, consecutive_hyphen_limit: number): string;
