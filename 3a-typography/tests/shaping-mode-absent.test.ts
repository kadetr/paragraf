// shaping-mode-absent.test.ts
//
// The same options when the WASM binary is missing, as on a fresh clone
// without Rust. The loader is replaced by one that fails the way Node does
// when the built package is not there.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';

vi.mock('@paragraf/shaping-wasm', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadShapingWasm: () => {
    throw new Error(
      "Cannot find module '../wasm/pkg/paragraf_shaping_wasm.js'",
    );
  },
}));

import {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
} from '@paragraf/typography';
import { FontRegistry, Font } from '@paragraf/types';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const FONT: Font = {
  id: 'liberation-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};
const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      family: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
]);
const TEXT =
  'Shaping mode selects the engine that measures and breaks this paragraph, and both engines must set it.';

afterEach(() => vi.restoreAllMocks());

describe('shaping mode — WASM binary missing', () => {
  it('reports the binary as absent', () => {
    expect(wasmStatus().status).toBe('absent');
  });

  it("'wasm' throws and says how to fix it", async () => {
    await expect(
      createParagraphComposer(REGISTRY, { shaping: 'wasm' }),
    ).rejects.toThrow(/shaping: 'wasm'.*not built\. Build it with `wasm-pack/s);
    await expect(
      createDefaultFontEngine(REGISTRY, { shaping: 'wasm' }),
    ).rejects.toThrow(/shaping: 'wasm'/);
  });

  it("'fontkit' works and does not warn", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const composer = await createParagraphComposer(REGISTRY, {
      shaping: 'fontkit',
    });
    const out = composer.compose({ text: TEXT, font: FONT, lineWidth: 200 });
    expect(out.lines.length).toBeGreaterThan(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("'auto' falls back, and warns once for the whole process", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const composer = await createParagraphComposer(REGISTRY); // default = auto
    await createParagraphComposer(REGISTRY, { shaping: 'auto' });
    await createDefaultFontEngine(REGISTRY, { shaping: 'auto' });
    await createParagraphComposer(REGISTRY, { useWasm: true }); // old spelling of auto
    const out = composer.compose({ text: TEXT, font: FONT, lineWidth: 200 });
    expect(out.lines.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(
      /WASM shaper is not built.*fontkit/s,
    );
  });
});
