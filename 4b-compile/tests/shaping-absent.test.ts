// shaping-absent.test.ts
//
// compile() and createCompilerSession() when the WASM binary is missing, as
// on a fresh clone without Rust. The loader is replaced by one that fails the
// way Node does when the built package is not there.

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

import { defineTemplate } from '@paragraf/template';
import { wasmStatus } from '@paragraf/typography';
import { compile } from '../src/compile.js';
import { createCompilerSession } from '../src/session.js';
import { compileBatch } from '../src/batch.js';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

const template = () =>
  defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'justified',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{body}}' }],
  });

const data = {
  body: 'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful.',
};

afterEach(() => vi.restoreAllMocks());

describe('compile() — WASM binary missing', () => {
  it('sees the binary as absent', () => {
    expect(wasmStatus().status).toBe('absent');
  });

  it("shaping: 'wasm' rejects with a message that says how to fix it", async () => {
    await expect(
      compile({
        template: template(),
        data,
        output: 'rendered',
        shaping: 'wasm',
      }),
    ).rejects.toThrow(/shaping: 'wasm'.*not built.*wasm-pack/s);
  });

  it("createCompilerSession with shaping: 'wasm' rejects too", async () => {
    await expect(
      createCompilerSession(template(), { shaping: 'wasm' }),
    ).rejects.toThrow(/shaping: 'wasm'/);
  });

  it("shaping: 'fontkit' compiles without a warning", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await compile({
      template: template(),
      data,
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(result.metadata.shapingEngine).toBe('fontkit');
    expect(warn).not.toHaveBeenCalled();
  });

  // Order matters from here: the warning is issued once per process, so the
  // quiet case runs before the case that triggers it.
  it("shaping: 'auto' with verbose: false falls back and prints nothing", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await compile({
      template: template(),
      data,
      output: 'rendered',
      verbose: false,
    });
    expect(result.metadata.shapingEngine).toBe('fontkit');
    expect(warn).not.toHaveBeenCalled();
  });

  it('verbose: false is also quiet for a session and for a batch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = await createCompilerSession(template(), { verbose: false });
    expect(session.shapingEngine).toBe('fontkit');
    const results = await compileBatch({
      template: template(),
      output: 'rendered',
      verbose: false,
      records: [data],
    });
    expect(results.length).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("shaping: 'wasm' with a session that fell back throws", async () => {
    const session = await createCompilerSession(template(), { verbose: false });
    await expect(
      compile({
        template: template(),
        data,
        output: 'rendered',
        session,
        shaping: 'wasm',
      }),
    ).rejects.toThrow(/session uses fontkit/);
  });

  it("shaping: 'auto' falls back to fontkit and warns once", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await compile({ template: template(), data, output: 'rendered' });
    const b = await compile({ template: template(), data, output: 'rendered' });
    expect(a.metadata.shapingEngine).toBe('fontkit');
    expect(b.metadata.shapingEngine).toBe('fontkit');
    const shapingWarnings = warn.mock.calls.filter((c) =>
      /WASM shaper is not built/.test(String(c[0])),
    );
    expect(shapingWarnings.length).toBe(1);
  });
});
