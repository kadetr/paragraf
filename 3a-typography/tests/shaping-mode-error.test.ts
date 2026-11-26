// shaping-mode-error.test.ts
//
// The WASM package is present but broken (status 'error'), as after a
// half-finished build. The messages must say so and say "Rebuild".

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';

vi.mock('@paragraf/shaping-wasm', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadShapingWasm: () => {
    throw new Error('WebAssembly.Module(): expected magic word 00 61 73 6d');
  },
}));

import { createParagraphComposer, wasmStatus } from '@paragraf/typography';
import { FontRegistry } from '@paragraf/types';

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      family: 'Liberation Serif',
      filePath: path.resolve(
        __dirname,
        '../../fonts/LiberationSerif-Regular.ttf',
      ),
    },
  ],
]);

afterEach(() => vi.restoreAllMocks());

describe('shaping mode — WASM binary present but broken', () => {
  it('reports status error with the cause', () => {
    expect(wasmStatus()).toEqual({
      status: 'error',
      error: 'WebAssembly.Module(): expected magic word 00 61 73 6d',
    });
  });

  it("'wasm' throws with the cause and says Rebuild", async () => {
    await expect(
      createParagraphComposer(REGISTRY, { shaping: 'wasm' }),
    ).rejects.toThrow(
      /shaping: 'wasm'.*failed to load \(.*expected magic word.*\)\. Rebuild it/s,
    );
  });

  it("'auto' falls back and the warning carries the cause", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await createParagraphComposer(REGISTRY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(
      /The WASM shaper failed to load \(.*expected magic word.*\); using the TypeScript\/fontkit path\. Rebuild it/s,
    );
  });
});
