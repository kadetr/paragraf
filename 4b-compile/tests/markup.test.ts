// markup.test.ts — Unit tests for parseInlineMarkup() (RT-1 to RT-4).

import { describe, it, expect } from 'vitest';
import { parseInlineMarkup } from '../src/markup.js';
import type { Font } from '@paragraf/types';
import type { CharStyleDef } from '@paragraf/style';

// ─── Fixture ─────────────────────────────────────────────────────────────────

const BASE_FONT: Font = {
  id: 'LiberationSerif-Regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

// ─── RT-1: <b> produces weight 700 ───────────────────────────────────────────

describe('parseInlineMarkup — <b> bold tag', () => {
  it('RT-1: <b>bold</b> produces a span with weight 700', () => {
    const spans = parseInlineMarkup('<b>bold</b>', BASE_FONT);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe('bold');
    expect(spans[0]!.font.weight).toBe(700);
    // Other font properties unchanged
    expect(spans[0]!.font.style).toBe('normal');
  });

  it('mixed text with <b> produces two spans', () => {
    const spans = parseInlineMarkup('Hello <b>world</b>!', BASE_FONT);
    expect(spans).toHaveLength(3);
    expect(spans[0]!.text).toBe('Hello ');
    expect(spans[0]!.font.weight).toBe(400);
    expect(spans[1]!.text).toBe('world');
    expect(spans[1]!.font.weight).toBe(700);
    expect(spans[2]!.text).toBe('!');
    expect(spans[2]!.font.weight).toBe(400);
  });
});

// ─── RT-2: <i> produces italic ───────────────────────────────────────────────

describe('parseInlineMarkup — <i> italic tag', () => {
  it('RT-2: <i>italic</i> produces a span with style "italic"', () => {
    const spans = parseInlineMarkup('<i>italic</i>', BASE_FONT);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe('italic');
    expect(spans[0]!.font.style).toBe('italic');
    expect(spans[0]!.font.weight).toBe(400);
  });

  it('<bi> produces bold italic span', () => {
    const spans = parseInlineMarkup('<bi>bolditalic</bi>', BASE_FONT);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.font.weight).toBe(700);
    expect(spans[0]!.font.style).toBe('italic');
  });
});

// ─── RT-3: <sup> produces positive verticalOffset ────────────────────────────

describe('parseInlineMarkup — <sup>/<sub> vertical offset', () => {
  it('RT-3: <sup> produces a span with positive verticalOffset', () => {
    const spans = parseInlineMarkup('x<sup>2</sup>', BASE_FONT);
    expect(spans).toHaveLength(2);
    const supSpan = spans[1]!;
    expect(supSpan.text).toBe('2');
    expect(supSpan.verticalOffset).toBeGreaterThan(0);
    // Should be +size * 0.35 = 12 * 0.35 = 4.2
    expect(supSpan.verticalOffset).toBeCloseTo(4.2, 5);
  });

  it('<sub> produces a span with negative verticalOffset', () => {
    const spans = parseInlineMarkup('H<sub>2</sub>O', BASE_FONT);
    expect(spans).toHaveLength(3);
    const subSpan = spans[1]!;
    expect(subSpan.text).toBe('2');
    expect(subSpan.verticalOffset).toBeLessThan(0);
    // Should be -size * 0.25 = -3.0
    expect(subSpan.verticalOffset).toBeCloseTo(-3.0, 5);
  });
});

// ─── RT-4: <span cs="NAME"> applies character style ─────────────────────────

describe('parseInlineMarkup — <span cs="NAME"> character style', () => {
  const charStyles: Record<string, CharStyleDef> = {
    smallcaps: { font: { size: 10, variant: 'normal' } },
    emphasis: { font: { style: 'italic', weight: 600 } },
  };

  it('RT-4: <span cs="emphasis"> applies font overrides from charStyles', () => {
    const spans = parseInlineMarkup(
      'Normal <span cs="emphasis">stressed</span> end.',
      BASE_FONT,
      charStyles,
    );
    expect(spans).toHaveLength(3);
    const emphasized = spans[1]!;
    expect(emphasized.text).toBe('stressed');
    expect(emphasized.font.style).toBe('italic');
    expect(emphasized.font.weight).toBe(600);
    // Font family/id unchanged
    expect(emphasized.font.id).toBe(BASE_FONT.id);
  });

  it('<span cs="smallcaps"> overrides size', () => {
    const spans = parseInlineMarkup(
      '<span cs="smallcaps">small</span>',
      BASE_FONT,
      charStyles,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.font.size).toBe(10);
  });

  it('unknown cs name falls back to base font', () => {
    const spans = parseInlineMarkup(
      '<span cs="nonexistent">text</span>',
      BASE_FONT,
      charStyles,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.font).toEqual(BASE_FONT);
  });
});

// ─── Fast-path: no markup ─────────────────────────────────────────────────────

describe('parseInlineMarkup — plain text fast path', () => {
  it('returns single span with original text and base font when no tags present', () => {
    const text = 'Plain text with no markup.';
    const spans = parseInlineMarkup(text, BASE_FONT);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe(text);
    expect(spans[0]!.font).toBe(BASE_FONT); // same reference (fast path)
  });
});
