import { describe, it, expect } from 'vitest';
import { mm, cm, inch, px } from '../src/units.js';

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
