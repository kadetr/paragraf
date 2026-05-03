export {
  WasmFontEngine,
  getFaceCacheStats,
  type FaceCacheStats,
  type WasmFontEngineOptions,
} from './engines/wasm-engine.js';
export { serializeNodesToBinary, tracebackWasmBinary } from './wasm-binary.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

/**
 * Load the compiled Rust/WASM module synchronously.
 * Throws if the WASM package is not present (e.g. wasm-pack not run).
 * The returned object is the raw wasm-bindgen JS module.
 */
export function loadShapingWasm(): unknown {
  return _require('../wasm/pkg/paragraf_shaping_wasm.js');
}
