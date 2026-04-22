/* @ts-self-types="./knuth_plass_wasm.d.ts" */

import * as wasm from "./knuth_plass_wasm_bg.wasm";
import { __wbg_set_wasm } from "./knuth_plass_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    analyze_bidi, analyze_bidi_v2, compute_breakpoints_wasm, create_face, drop_face, font_metrics_wasm, get_glyph_path, hello, measure_text_wasm, register_font, round_trip_node, round_trip_paragraph, shape_text_wasm, shape_with_face, space_metrics_wasm, traceback_wasm, traceback_wasm_binary
} from "./knuth_plass_wasm_bg.js";
