import { describe, it, expect } from 'vitest';
import { mm, cm, inch, px, parseDimension } from '../src/units.js';

describe('mm', () => {
  it('converts millimetres to points', () => {
    expect(mm(1)).toBeCloseTo(2.834646, 5);
  });

  it('mm(0) === 0', () => {
    expect(mm(0)).toBe(0);
  });

  it('mm(25.4) ≈ 72 (one inch)', () => {
    expect(mm(25.4)).toBeCloseTo(72, 5);
  });
});

describe('cm', () => {
  it('converts centimetres to points', () => {
    expect(cm(1)).toBeCloseTo(28.346457, 4);
  });

  it('cm(1) === mm(10)', () => {
    expect(cm(1)).toBeCloseTo(mm(10), 10);
  });

  it('cm(0) === 0', () => {
    expect(cm(0)).toBe(0);
  });
});

describe('inch', () => {
  it('inch(1) === 72', () => {
    expect(inch(1)).toBe(72);
  });

  it('inch(0.5) === 36', () => {
    expect(inch(0.5)).toBe(36);
  });
});

describe('px', () => {
  it('px(96) === 72 at default 96dpi', () => {
    expect(px(96)).toBe(72);
  });

  it('px(100) at 96dpi ≈ 75', () => {
    expect(px(100)).toBeCloseTo(75, 5);
  });

  it('px(300, 300) === 72 at 300dpi', () => {
    expect(px(300, 300)).toBe(72);
  });

  it('px(100, 300) ≈ 24 at 300dpi', () => {
    expect(px(100, 300)).toBeCloseTo(24, 5);
  });

  it('px(0) === 0', () => {
    expect(px(0)).toBe(0);
  });
});

describe('parseDimension', () => {
  describe('string units', () => {
    it("'20mm' → mm(20)", () => {
      expect(parseDimension('20mm')).toBeCloseTo(mm(20), 10);
    });

    it("'2cm' → cm(2)", () => {
      expect(parseDimension('2cm')).toBeCloseTo(cm(2), 10);
    });

    it("'0.5in' → inch(0.5)", () => {
      expect(parseDimension('0.5in')).toBeCloseTo(inch(0.5), 10);
    });

    it("'36pt' → 36", () => {
      expect(parseDimension('36pt')).toBe(36);
    });

    it("'100px' → px(100)", () => {
      expect(parseDimension('100px')).toBeCloseTo(px(100), 10);
    });

    it('is case-insensitive for unit suffix', () => {
      expect(parseDimension('10MM')).toBeCloseTo(mm(10), 10);
      expect(parseDimension('10PT')).toBe(10);
    });

    it('trims leading/trailing whitespace', () => {
      expect(parseDimension('  10mm  ')).toBeCloseTo(mm(10), 10);
    });
  });

  describe('numeric pass-through', () => {
    it('number → same number', () => {
      expect(parseDimension(36)).toBe(36);
    });

    it('0 → 0', () => {
      expect(parseDimension(0)).toBe(0);
    });
  });

  describe('error cases', () => {
    it('throws on unknown unit', () => {
      expect(() => parseDimension('10em')).toThrow(/Unrecognised dimension/i);
    });

    it('throws on bare number string', () => {
      expect(() => parseDimension('100')).toThrow(/Unrecognised dimension/i);
    });

    it('throws on empty string', () => {
      expect(() => parseDimension('')).toThrow(/Unrecognised dimension/i);
    });
  });
});
