import { describe, it, expect } from 'vitest';
import { defineCharStyles } from '../src/index.js';

describe('defineCharStyles — construction', () => {
  it('empty registry does not throw', () => {
    expect(() => defineCharStyles({})).not.toThrow();
  });

  it('.names returns all defined char style names', () => {
    const r = defineCharStyles({ em: {}, strong: {}, code: {} });
    expect(r.names().sort()).toEqual(['code', 'em', 'strong']);
  });
});

describe('charRegistry.resolve', () => {
  it('returns CharStyleDef as-is (italic emphasis)', () => {
    const r = defineCharStyles({ emphasis: { font: { style: 'italic' } } });
    const resolved = r.resolve('emphasis');
    expect(resolved.font.style).toBe('italic');
  });

  it('color is preserved in resolved output', () => {
    const r = defineCharStyles({ red: { color: '#ff0000' } });
    expect(r.resolve('red').color).toBe('#ff0000');
  });

  it('letterSpacing is preserved via font.letterSpacing', () => {
    const r = defineCharStyles({ spaced: { font: { letterSpacing: 0.5 } } });
    expect(r.resolve('spaced').font.letterSpacing).toBe(0.5);
  });

  it('font with size override is preserved', () => {
    const r = defineCharStyles({ small: { font: { size: 8 } } });
    expect(r.resolve('small').font.size).toBe(8);
  });

  it('resolving empty char style returns empty font object', () => {
    const r = defineCharStyles({ plain: {} });
    expect(r.resolve('plain').font).toEqual({});
    expect(r.resolve('plain').color).toBeUndefined();
  });

  it('.resolve throws with descriptive error for unknown name', () => {
    const r = defineCharStyles({});
    expect(() => r.resolve('ghost')).toThrow(/Character style "ghost"/);
  });
});
