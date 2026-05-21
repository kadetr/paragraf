import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Explicit external list — electron-vite 5 / rolldown does not reliably apply
// externalizeDepsPlugin via the config hook, so we also set it directly.
const nodeExternal = [
  'electron',
  'chokidar',
  'electron-store',
  '@xmldom/xmldom',
  /^node:.*/,
  /^electron\/.*/,
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: nodeExternal,
        input: {
          index: resolve(__dirname, 'electron.main.ts'),
          'compile.worker': resolve(__dirname, 'workers/compile.worker.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: nodeExternal,
        input: {
          index: resolve(__dirname, 'electron.preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, '.'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@paragraf/compile': resolve(__dirname, '../4b-compile/src/index.ts'),
        '@paragraf/template': resolve(__dirname, '../4a-template/src/index.ts'),
        '@paragraf/layout': resolve(__dirname, '../1c-layout/src/index.ts'),
        '@paragraf/style': resolve(__dirname, '../1d-style/src/index.ts'),
        '@paragraf/types': resolve(__dirname, '../0-types/src/index.ts'),
        '@paragraf/linebreak': resolve(
          __dirname,
          '../1a-linebreak/src/index.ts',
        ),
        '@paragraf/font-engine': resolve(
          __dirname,
          '../1b-font-engine/src/index.ts',
        ),
        '@paragraf/shaping-wasm': resolve(
          __dirname,
          '../2a-shaping-wasm/src/index.ts',
        ),
        '@paragraf/render-core': resolve(
          __dirname,
          '../2b-render-core/src/index.ts',
        ),
        '@paragraf/render-pdf': resolve(
          __dirname,
          '../3b-render-pdf/src/index.ts',
        ),
        '@paragraf/typography': resolve(
          __dirname,
          '../3a-typography/src/index.ts',
        ),
        '@paragraf/color': resolve(__dirname, '../0-color/src/index.ts'),
      },
    },
  },
});
