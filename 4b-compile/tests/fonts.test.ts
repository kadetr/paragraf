import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import type { FontRegistry } from '@paragraf/types';
import {
  VARIANT_CONVENTIONS,
  resolveVariantEntry,
  buildFontRegistry,
  selectVariant,
} from '../src/fonts.js';

const BASE = '/base';

// ─── VARIANT_CONVENTIONS ─────────────────────────────────────────────────────

describe('VARIANT_CONVENTIONS', () => {
  it('has 18 entries', () => {
    expect(Object.keys(VARIANT_CONVENTIONS)).toHaveLength(18);
  });

  it('maps regular to weight 400 / normal', () => {
    expect(VARIANT_CONVENTIONS.regular).toEqual({
      weight: 400,
      style: 'normal',
    });
  });

  it('maps bold to weight 700 / normal', () => {
    expect(VARIANT_CONVENTIONS.bold).toEqual({ weight: 700, style: 'normal' });
  });

  it('maps italic to weight 400 / italic', () => {
    expect(VARIANT_CONVENTIONS.italic).toEqual({
      weight: 400,
      style: 'italic',
    });
  });

  it('maps boldItalic to weight 700 / italic', () => {
    expect(VARIANT_CONVENTIONS.boldItalic).toEqual({
      weight: 700,
      style: 'italic',
    });
  });

  it('maps thin to weight 100 / normal', () => {
    expect(VARIANT_CONVENTIONS.thin).toEqual({ weight: 100, style: 'normal' });
  });

  it('maps blackItalic to weight 900 / italic', () => {
    expect(VARIANT_CONVENTIONS.blackItalic).toEqual({
      weight: 900,
      style: 'italic',
    });
  });
});

// ─── resolveVariantEntry ─────────────────────────────────────────────────────

describe('resolveVariantEntry', () => {
  it('resolves a string shorthand for a known key', () => {
    const r = resolveVariantEntry('regular', './fonts/Regular.ttf', BASE);
    expect(r.filePath).toBe('/base/fonts/Regular.ttf');
    expect(r.weight).toBe(400);
    expect(r.style).toBe('normal');
    expect(r.stretch).toBe('normal');
  });

  it('resolves a string shorthand for bold', () => {
    const r = resolveVariantEntry('bold', './fonts/Bold.ttf', BASE);
    expect(r.weight).toBe(700);
    expect(r.style).toBe('normal');
  });

  it('resolves object form — explicit fields win over convention', () => {
    const r = resolveVariantEntry(
      'light',
      { path: './Light.ttf', weight: 300 },
      BASE,
    );
    expect(r.weight).toBe(300);
    expect(r.style).toBe('normal');
    expect(r.filePath).toBe('/base/Light.ttf');
  });

  it('object form explicit style overrides convention', () => {
    const r = resolveVariantEntry(
      'bold',
      { path: './B.ttf', weight: 900, style: 'italic' },
      BASE,
    );
    expect(r.weight).toBe(900);
    expect(r.style).toBe('italic');
  });

  it('returns stretch: normal by default', () => {
    const r = resolveVariantEntry('regular', './R.ttf', BASE);
    expect(r.stretch).toBe('normal');
  });

  it('object form can set stretch', () => {
    const r = resolveVariantEntry(
      'regular',
      { path: './C.ttf', stretch: 'condensed' },
      BASE,
    );
    expect(r.stretch).toBe('condensed');
  });

  it('warns for unknown string-shorthand key', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveVariantEntry('myCustom', './C.ttf', BASE);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"myCustom"'));
    expect(r.weight).toBe(400); // fallback
    expect(r.style).toBe('normal');
    spy.mockRestore();
  });

  it('resolves an absolute path unchanged', () => {
    const r = resolveVariantEntry('regular', '/abs/Font.ttf', BASE);
    expect(r.filePath).toBe('/abs/Font.ttf');
  });
});

// ─── buildFontRegistry ────────────────────────────────────────────────────────

describe('buildFontRegistry', () => {
  it('builds a registry with correct FontId keys', () => {
    const fonts = {
      Serif: {
        regular: './Serif-Regular.ttf',
        bold: './Serif-Bold.ttf',
      },
    };
    const reg = buildFontRegistry(fonts, BASE);
    expect(reg.has('Serif/regular')).toBe(true);
    expect(reg.has('Serif/bold')).toBe(true);
    expect(reg.size).toBe(2);
  });

  it('stores correct family on each descriptor', () => {
    const fonts = { Roboto: { regular: './R.ttf' } };
    const reg = buildFontRegistry(fonts, BASE);
    expect(reg.get('Roboto/regular')?.family).toBe('Roboto');
  });

  it('skips undefined entries', () => {
    const fonts = {
      Serif: {
        regular: './R.ttf',
        bold: undefined,
      },
    };
    const reg = buildFontRegistry(fonts, BASE);
    expect(reg.size).toBe(1);
  });

  it('handles multiple families', () => {
    const fonts = {
      Serif: { regular: './S-R.ttf' },
      Sans: { regular: './A-R.ttf', bold: './A-B.ttf' },
    };
    const reg = buildFontRegistry(fonts, BASE);
    expect(reg.size).toBe(3);
    expect(reg.has('Serif/regular')).toBe(true);
    expect(reg.has('Sans/regular')).toBe(true);
    expect(reg.has('Sans/bold')).toBe(true);
  });
});

// ─── selectVariant ────────────────────────────────────────────────────────────

describe('selectVariant', () => {
  const makeRegistry = (): FontRegistry =>
    new Map([
      [
        'Serif/regular',
        {
          id: 'Serif/regular',
          family: 'Serif',
          filePath: '/R.ttf',
          weight: 400,
          style: 'normal' as const,
        },
      ],
      [
        'Serif/bold',
        {
          id: 'Serif/bold',
          family: 'Serif',
          filePath: '/B.ttf',
          weight: 700,
          style: 'normal' as const,
        },
      ],
      [
        'Serif/italic',
        {
          id: 'Serif/italic',
          family: 'Serif',
          filePath: '/I.ttf',
          weight: 400,
          style: 'italic' as const,
        },
      ],
      [
        'Serif/boldItalic',
        {
          id: 'Serif/boldItalic',
          family: 'Serif',
          filePath: '/BI.ttf',
          weight: 700,
          style: 'italic' as const,
        },
      ],
    ]);

  it('exact match: weight 400, normal', () => {
    expect(selectVariant('Serif', 400, 'normal', makeRegistry())).toBe(
      'Serif/regular',
    );
  });

  it('exact match: weight 700, normal', () => {
    expect(selectVariant('Serif', 700, 'normal', makeRegistry())).toBe(
      'Serif/bold',
    );
  });

  it('exact match: weight 400, italic', () => {
    expect(selectVariant('Serif', 400, 'italic', makeRegistry())).toBe(
      'Serif/italic',
    );
  });

  it('nearest weight: 600 → 700 (normal pool)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = selectVariant('Serif', 600, 'normal', makeRegistry());
    expect(id).toBe('Serif/bold');
    spy.mockRestore();
  });

  it('nearest weight: 300 → 400 (target ≤ 500, prefers lower)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = selectVariant('Serif', 300, 'normal', makeRegistry());
    // Both 400 and 700 are candidates; 400 is nearer (diff 100 vs 400 → clears)
    expect(id).toBe('Serif/regular');
    spy.mockRestore();
  });

  it('falls back to normal style when italic variants absent', () => {
    const reg: FontRegistry = new Map([
      [
        'Sans/regular',
        {
          id: 'Sans/regular',
          family: 'Sans',
          filePath: '/R.ttf',
          weight: 400,
          style: 'normal' as const,
        },
      ],
    ]);
    const id = selectVariant('Sans', 400, 'italic', reg);
    expect(id).toBe('Sans/regular');
  });

  it('throws when no variants for family', () => {
    expect(() =>
      selectVariant('Unknown', 400, 'normal', makeRegistry()),
    ).toThrow(/No fonts registered for family "Unknown"/);
  });

  it('warns on inexact weight match', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    selectVariant('Serif', 600, 'normal', makeRegistry());
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('No exact weight'),
    );
    spy.mockRestore();
  });
});
