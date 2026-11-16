import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: false,
  // tsup inlines anything not listed under dependencies/peerDependencies.
  // The optional @paragraf/* packages must stay imports: inlined, their WASM
  // loaders look for ../wasm/pkg inside this package, where it does not exist.
  external: [/^@paragraf\//],
});
