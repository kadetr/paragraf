/* @ts-self-types="./knuth_plass_wasm.d.ts" */

import * as wasm from "./knuth_plass_wasm_bg.wasm";
import { __wbg_set_wasm } from "./knuth_plass_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    analyze_bidi, compute_breakpoints_wasm, font_metrics_wasm, get_glyph_path, hello, measure_text_wasm, register_font, round_trip_node, round_trip_paragraph, shape_text_wasm, space_metrics_wasm, traceback_wasm, traceback_wasm_binary
} from "./knuth_plass_wasm_bg.js";
