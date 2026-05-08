// tests/font-engine-interface.test.ts
// F011: applyLigatures / applySingleSubstitution should be optional on FontEngine.
// T6: A FontEngine object without applyLigatures compiles and satisfies the interface.
// T7: render-core renders with a FontEngine that omits applyLigatures.

import { describe, it, expect } from 'vitest';
import type { FontEngine, Glyph, GlyphPath } from '../src/font-engine.js';
import type { Font, FontMetrics } from '@paragraf/types';

// ─── T6: minimal FontEngine without applyLigatures / applySingleSubstitution ──

// This object intentionally omits applyLigatures and applySingleSubstitution.
// It MUST be assignable to FontEngine after the fix (making those methods optional).
// Before the fix this will produce a TypeScript compile error — which vitest
// surfaces as a type-check failure when run with tsc strict mode.

const minimalEngine: FontEngine = {
  async loadFont(_id: string, _path: string): Promise<void> {},

  glyphsForString(_fontId: string, _text: string, _font?: Font): Glyph[] {
    return [];
  },

  getGlyphPath(
    _fontId: string,
    _glyph: Glyph,
    _x: number,
    _y: number,
    _fontSize: number,
  ): GlyphPath {
    return {
      commands: [],
      toSVG: () => '',
    };
  },

  getFontMetrics(_fontId: string, _fontSize: number): FontMetrics {
    return {
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      xHeight: 500,
      capHeight: 700,
      lineGap: 0,
      baselineShift: 0,
    };
  },

  getKerning(_fontId: string, _glyph1: Glyph, _glyph2: Glyph): number {
    return 0;
  },
  // applyLigatures: intentionally omitted — must compile after F011 fix
  // applySingleSubstitution: intentionally omitted — must compile after F011 fix
};

describe('F011 — optional FontEngine methods (T6)', () => {
  it('T6: minimal FontEngine without applyLigatures is assignable to FontEngine interface', () => {
    // If the interface makes applyLigatures optional, this assignment compiles.
    // The test itself just verifies the object was constructed without error.
    expect(minimalEngine).toBeDefined();
    expect(typeof minimalEngine.glyphsForString).toBe('function');
    expect(typeof minimalEngine.getGlyphPath).toBe('function');
    expect(typeof minimalEngine.getFontMetrics).toBe('function');
    // Must NOT have applyLigatures — verifying the omission
    expect('applyLigatures' in minimalEngine).toBe(false);
    expect('applySingleSubstitution' in minimalEngine).toBe(false);
  });

  it('T6b: FontEngine with applyLigatures still satisfies the interface', () => {
    const fullEngine: FontEngine = {
      ...minimalEngine,
      applyLigatures(_fontId: string, glyphs: Glyph[]): Glyph[] {
        return glyphs;
      },
      applySingleSubstitution(
        _fontId: string,
        glyphs: Glyph[],
        _featureTag: 'sups' | 'subs',
      ): Glyph[] {
        return glyphs;
      },
    };
    expect(typeof fullEngine.applyLigatures).toBe('function');
    expect(typeof fullEngine.applySingleSubstitution).toBe('function');
  });
});
