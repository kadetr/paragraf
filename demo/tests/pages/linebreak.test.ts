import { describe, it, expect, vi } from 'vitest';
import {
  buildStatusText,
  TOLERANCE_SLIDER,
  LOOSENESS_SLIDER,
  DEFAULT_ALIGNMENT,
  DEFAULT_TOLERANCE,
} from '../../src/pages/linebreak.js';

// The linebreak page transitively imports the WASM module. Mock it so tests
// can import the module without a real WASM binary.
vi.mock(
  '../../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js',
  () => ({
    measure_text_wasm: vi.fn(() => JSON.stringify({ ok: { width: 6 } })),
    space_metrics_wasm: vi.fn(() =>
      JSON.stringify({ ok: { width: 3, shrink: 1, stretch: 1.5 } }),
    ),
    font_metrics_wasm: vi.fn(() =>
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
    ),
    register_font: vi.fn(),
    shape_text_wasm: vi.fn(() => JSON.stringify({ ok: { glyphs: [] } })),
    get_glyph_path: vi.fn(),
    get_kerning_wasm: vi.fn(),
  }),
);

describe('linebreak page logic', () => {
  it('buildStatusText formats "12 lines · 0 emergency"', () => {
    const text = buildStatusText(12, 3420, 0);
    expect(text).toBe('12 lines · 0 emergency');
  });

  it('buildStatusText omits emergency section for greedy (demerits = -1)', () => {
    const text = buildStatusText(8, -1, 0);
    expect(text).toBe('8 lines');
  });

  it('tolerance slider min/max/step are 1/10/0.5', () => {
    expect(TOLERANCE_SLIDER.min).toBe(1);
    expect(TOLERANCE_SLIDER.max).toBe(10);
    expect(TOLERANCE_SLIDER.step).toBe(0.5);
  });

  it('looseness slider min/max/step are -2/2/1', () => {
    expect(LOOSENESS_SLIDER.min).toBe(-2);
    expect(LOOSENESS_SLIDER.max).toBe(2);
    expect(LOOSENESS_SLIDER.step).toBe(1);
  });

  it('default alignment is "justified"', () => {
    expect(DEFAULT_ALIGNMENT).toBe('justified');
  });

  it('default tolerance is 2', () => {
    expect(DEFAULT_TOLERANCE).toBe(2);
  });
});
