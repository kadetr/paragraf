import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

/**
 * Load the compiled Rust/WASM color transform module synchronously.
 * Throws if the WASM package is not present (i.e. wasm-pack has not been run).
 * The returned object is the raw wasm-bindgen JS module.
 *
 * Call once before constructing `WasmColorTransform` or using `createWasmTransform`.
 */
export function loadColorWasm(): unknown {
  return _require('../wasm/pkg/color_wasm.js');
}
