import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: false,
  // The wasm-bindgen glue must not be bundled — it uses __dirname and
  // require('fs').readFileSync to locate color_wasm_bg.wasm at runtime.
  // Bundling would break the relative path resolution.
  external: ['../wasm/pkg/color_wasm.js'],
});
