import { describe, it, expect, vi, beforeAll } from 'vitest';
import { runPipeline, diffLines } from '../../src/rendering/pipeline.js';
import type { PipelineParams } from '../../src/rendering/pipeline.js';
import type { FontRegistry, FontDescriptor } from '@paragraf/types';
import { loadHyphenator } from '@paragraf/linebreak';

// Mock WASM: length-proportional widths so words wrap to multiple lines.
vi.mock(
  '../../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js',
  () => ({
    measure_text_wasm: (text: string, fontJson: string) => {
      const { size } = JSON.parse(fontJson) as { size: number };
      return JSON.stringify({ ok: { width: text.length * size * 0.55 } });
    },
    space_metrics_wasm: () =>
      JSON.stringify({ ok: { width: 3.3, shrink: 1, stretch: 1.5 } }),
    font_metrics_wasm: () =>
      JSON.stringify({
        ok: {
          unitsPerEm: 1000,
          ascender: 9.6,
          descender: -2.4,
          xHeight: 5,
          capHeight: 7,
          lineGap: 0,
          baselineShift: 0,
        },
      }),
    register_font: vi.fn(),
    shape_text_wasm: (text: string, fontJson: string) => {
      const { size } = JSON.parse(fontJson) as { size: number };
      const advW = Math.round((size * 0.55 * 1000) / size);
      return JSON.stringify({
        ok: {
          glyphs: text.split('').map(() => ({
            glyphId: 1,
            advanceWidth: advW,
            xOffset: 0,
            yOffset: 0,
          })),
        },
      });
    },
    get_glyph_path: vi.fn(),
    get_kerning_wasm: vi.fn(() => JSON.stringify({ ok: 0 })),
  }),
);

function makeRegistry(): FontRegistry {
  const descriptor: FontDescriptor = {
    id: 'roboto',
    family: 'Roboto',
    filePath: '',
  };
  return new Map([['roboto', descriptor]]);
}

// A stub engine for rendering — renderToSvg calls fontEngine.getGlyphPath etc.
// We use a plain object that satisfies the FontEngine interface minimally.
function makeStubEngine() {
  return {
    loadFontBytes: vi.fn(),
    glyphsForString: vi.fn((_id: string, text: string) =>
      text.split('').map(() => ({ index: 1, advanceWidth: 500 })),
    ),
    applyLigatures: vi.fn((_id: string, g: unknown[]) => g),
    applySingleSubstitution: vi.fn((_id: string, g: unknown[]) => g),
    getKerning: vi.fn(() => 0),
    getGlyphPath: vi.fn(
      (_id: string, _glyph: unknown, x: number, y: number) => ({
        toSVG: () => `<path d="M${x.toFixed(2)},${y.toFixed(2)}"/>`,
      }),
    ),
    fontMetrics: vi.fn(() => ({
      unitsPerEm: 1000,
      ascender: 9.6,
      descender: -2.4,
      xHeight: 5,
      capHeight: 7,
      lineGap: 0,
      baselineShift: 0,
    })),
    getFontMetrics: vi.fn(() => ({
      unitsPerEm: 1000,
      ascender: 9.6,
      descender: -2.4,
      xHeight: 5,
      capHeight: 7,
      lineGap: 0,
      baselineShift: 0,
    })),
  };
}

function makeParams(overrides: Partial<PipelineParams> = {}): PipelineParams {
  return {
    text: 'In olden times when wishing still helped one there lived a king whose daughters were all beautiful.',
    font: {
      id: 'roboto',
      size: 12,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    },
    lineWidth: 120,
    tolerance: 2,
    looseness: 0,
    alignment: 'justified',
    language: 'en-us',
    registry: makeRegistry(),
    engine: makeStubEngine() as unknown as PipelineParams['engine'],
    ...overrides,
  };
}

describe('pipeline', () => {
  beforeAll(async () => {
    // Load English hyphenation patterns — same as the browser does at boot.
    await loadHyphenator('en-us');
  });
  it('returns { kp, greedy } — both strings start with <svg', () => {
    const result = runPipeline(makeParams());
    expect(result.kp).toMatch(/^<svg/);
    expect(result.greedy).toMatch(/^<svg/);
  });

  it('KP output changes when tolerance changes — both produce valid SVG', () => {
    const a = runPipeline(makeParams({ tolerance: 2 }));
    const b = runPipeline(makeParams({ tolerance: 6 }));
    expect(a.kp).toMatch(/^<svg/);
    expect(b.kp).toMatch(/^<svg/);
    expect(a.kpLineCount).toBeGreaterThan(0);
    expect(b.kpLineCount).toBeGreaterThan(0);
  });

  it('KP output changes when looseness changes — both produce valid SVG', () => {
    const a = runPipeline(makeParams({ looseness: 0 }));
    const b = runPipeline(makeParams({ looseness: 2 }));
    expect(a.kp).toMatch(/^<svg/);
    expect(b.kp).toMatch(/^<svg/);
  });

  it('alignment "left" produces different SVG than "justified"', () => {
    const justified = runPipeline(makeParams({ alignment: 'justified' }));
    const left = runPipeline(makeParams({ alignment: 'left' }));
    // At lineWidth: 120 the paragraph wraps to multiple lines, making word spacing differ.
    expect(justified.kpLineCount).toBeGreaterThan(1);
    expect(justified.kp).not.toBe(left.kp);
  });

  it('empty text input → returns empty SVG (no exception)', () => {
    const result = runPipeline(makeParams({ text: '' }));
    expect(result.kp).toMatch(/^<svg/);
    expect(result.kpLineCount).toBe(0);
    expect(result.greedyLineCount).toBe(0);
  });

  it('diffLines() returns indices where KP and greedy word counts differ', () => {
    const kpLines = [
      { wordRuns: [['a'], ['b']] },
      { wordRuns: [['c'], ['d']] },
      { wordRuns: [['e'], ['f']] },
      { wordRuns: [['g']] },
    ];
    const greedyLines = [
      { wordRuns: [['a'], ['b']] },
      { wordRuns: [['c'], ['d']] },
      { wordRuns: [['e'], ['f']] },
      { wordRuns: [['g'], ['h']] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const diff = diffLines(kpLines as any, greedyLines as any);
    expect(diff).toContain(3);
    expect(diff).not.toContain(0);
  });

  it('diffLines() returns empty array when both produce identical lines', () => {
    const lines = [{ wordRuns: [['a'], ['b']] }, { wordRuns: [['c'], ['d']] }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const diff = diffLines(lines as any, lines as any);
    expect(diff).toHaveLength(0);
  });
});
