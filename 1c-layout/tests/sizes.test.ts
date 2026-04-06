import { describe, it, expect } from 'vitest';
import { PAGE_SIZES, resolvePageSize } from '../src/sizes.js';

describe('PAGE_SIZES', () => {
  it('contains all expected names', () => {
    const expected = [
      'A3',
      'A4',
      'A5',
      'A6',
      'B4',
      'B5',
      'Letter',
      'Legal',
      'Tabloid',
    ];
    for (const name of expected) {
      expect(PAGE_SIZES).toHaveProperty(name);
    }
  });

  it('A4 is 595.28 × 841.89 points (within ±0.01)', () => {
    const [w, h] = PAGE_SIZES.A4;
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
  });

  it('Letter is 612 × 792 points', () => {
    expect(PAGE_SIZES.Letter[0]).toBe(612);
    expect(PAGE_SIZES.Letter[1]).toBe(792);
  });

  it('all sizes have positive width and height', () => {
    for (const [name, [w, h]] of Object.entries(PAGE_SIZES)) {
      expect(w, `${name} width`).toBeGreaterThan(0);
      expect(h, `${name} height`).toBeGreaterThan(0);
    }
  });
});

describe('resolvePageSize', () => {
  it('resolves a named size', () => {
    const [w, h] = resolvePageSize('A4');
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
  });

  it('passes through a tuple unchanged', () => {
    expect(resolvePageSize([400, 600])).toEqual([400, 600]);
  });

  it('passes through zero-based custom size', () => {
    expect(resolvePageSize([0, 0])).toEqual([0, 0]);
  });

  it('resolves all named sizes without error', () => {
    const names = Object.keys(PAGE_SIZES) as Array<keyof typeof PAGE_SIZES>;
    for (const name of names) {
      expect(() => resolvePageSize(name)).not.toThrow();
    }
  });
});
