import { defineConfig } from 'vitest/config';

const alias = {
  '@paragraf/types': new URL('../0-types/src/index.ts', import.meta.url)
    .pathname,
  '@paragraf/color': new URL('../0-color/src/index.ts', import.meta.url)
    .pathname,
  '@paragraf/linebreak': new URL(
    '../1a-linebreak/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/font-engine': new URL(
    '../1b-font-engine/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/layout': new URL('../1c-layout/src/index.ts', import.meta.url)
    .pathname,
  '@paragraf/style': new URL('../1d-style/src/index.ts', import.meta.url)
    .pathname,
  '@paragraf/shaping-wasm': new URL(
    '../2a-shaping-wasm/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/render-core': new URL(
    '../2b-render-core/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/typography': new URL(
    '../3a-typography/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/render-pdf': new URL(
    '../3b-render-pdf/src/index.ts',
    import.meta.url,
  ).pathname,
  '@paragraf/template': new URL('../4a-template/src/index.ts', import.meta.url)
    .pathname,
  '@paragraf/compile': new URL('../4b-compile/src/index.ts', import.meta.url)
    .pathname,
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'happy-dom',
          globals: true,
          include: ['tests/**/*.test.tsx', 'tests/hooks/**/*.test.ts'],
          environment: 'happy-dom',
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'node',
          globals: true,
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/hooks/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
  },
});
