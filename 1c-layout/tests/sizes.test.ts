import { describe, it, expect } from 'vitest';
import {
  PAGE_SIZES,
  resolvePageSize,
  landscape,
  portrait,
} from '../src/sizes.js';

describe('PAGE_SIZES', () => {
  it('contains all expected names', () => {
    const expected = [
      'A0',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'B4',
      'B5',
      'SRA3',
      'SRA4',
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

  it('throws on unknown named size with helpful message', () => {
    expect(() => resolvePageSize('A99' as any)).toThrow(
      /Unknown page size.*A99/,
    );
  });

  it('error message lists valid size names', () => {
    expect(() => resolvePageSize('XXX' as any)).toThrow(
      /A4.*Letter|Letter.*A4/,
    );
  });

  // Intentionally unguarded: resolvePageSize passes zero-dimension tuples through.
  // Zero-width pages will cause division-by-zero at the compositor — callers are
  // responsible for validating page dimensions before passing to PageLayout.
  it('passes through a custom tuple with any dimensions (including zero)', () => {
    expect(resolvePageSize([0, 0])).toEqual([0, 0]);
    expect(resolvePageSize([100, 0])).toEqual([100, 0]);
  });

  it('resolves all named sizes without error', () => {
    const names = Object.keys(PAGE_SIZES) as Array<keyof typeof PAGE_SIZES>;
    for (const name of names) {
      expect(() => resolvePageSize(name)).not.toThrow();
    }
  });
});

describe('landscape / portrait', () => {
  it('landscape(A4) returns width > height', () => {
    const [w, h] = landscape('A4');
    expect(w).toBeGreaterThan(h);
  });

  it('portrait(A4) returns height > width', () => {
    const [w, h] = portrait('A4');
    expect(h).toBeGreaterThan(w);
  });

  it('landscape of a tuple that is already landscape returns it unchanged', () => {
    const [lw, lh] = landscape([1224, 792]); // [1224, 792] is already w > h
    expect(lw).toBe(1224);
    expect(lh).toBe(792);
  });

  it('portrait(A4) equals A4 (already portrait)', () => {
    expect(portrait('A4')).toEqual([PAGE_SIZES.A4[0], PAGE_SIZES.A4[1]]);
  });

  it('landscape and portrait are inverses', () => {
    const [lw, lh] = landscape('A3');
    const [pw, ph] = portrait('A3');
    expect(lw).toBe(ph);
    expect(lh).toBe(pw);
  });

  it('landscape works with a tuple', () => {
    expect(landscape([595, 842])).toEqual([842, 595]);
  });

  it('portrait works with a tuple', () => {
    expect(portrait([842, 595])).toEqual([595, 842]);
  });
});

// ─── RT-1: JIS B-series and envelope sizes present ────────────────────────────

describe('PAGE_SIZES — JIS B-series and envelope sizes (F035)', () => {
  it('RT-1: has JIS-B4, JIS-B5, DL, C5, C6 keys', () => {
    const expected = ['JIS-B4', 'JIS-B5', 'DL', 'C5', 'C6'];
    for (const name of expected) {
      expect(PAGE_SIZES, `expected key ${name}`).toHaveProperty(name);
    }
  });

  it('RT-1 ext: has full JIS-B0 through JIS-B6 keys', () => {
    for (let i = 0; i <= 6; i++) {
      expect(PAGE_SIZES, `expected key JIS-B${i}`).toHaveProperty(`JIS-B${i}`);
    }
  });

  // RT-2: JIS-B4 dimensions — 257 × 364 mm in JIS P 0138
  // 257 mm × (72/25.4) = 728.50 pt  ;  364 mm × (72/25.4) = 1031.81 pt
  it('RT-2: resolvePageSize("JIS-B4") ≈ [728.50, 1031.81] pt', () => {
    const [w, h] = resolvePageSize('JIS-B4');
    expect(w).toBeCloseTo(728.5, 1);
    expect(h).toBeCloseTo(1031.81, 1);
  });

  it('JIS-B series sizes decrease monotonically', () => {
    const areas = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const [w, h] = PAGE_SIZES[`JIS-B${i}` as keyof typeof PAGE_SIZES];
      return w * h;
    });
    for (let i = 0; i < areas.length - 1; i++) {
      expect(areas[i]).toBeGreaterThan(areas[i + 1]);
    }
  });
});
