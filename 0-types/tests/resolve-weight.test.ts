import { describe, it, expect } from 'vitest';
import { resolveWeight } from '../src/index.js';

describe('resolveWeight', () => {
  describe('named keywords', () => {
    it("'thin' → 100", () => expect(resolveWeight('thin')).toBe(100));
    it("'extra-light' → 200", () =>
      expect(resolveWeight('extra-light')).toBe(200));
    it("'light' → 300", () => expect(resolveWeight('light')).toBe(300));
    it("'normal' → 400", () => expect(resolveWeight('normal')).toBe(400));
    it("'medium' → 500", () => expect(resolveWeight('medium')).toBe(500));
    it("'semi-bold' → 600", () => expect(resolveWeight('semi-bold')).toBe(600));
    it("'bold' → 700", () => expect(resolveWeight('bold')).toBe(700));
    it("'extra-bold' → 800", () =>
      expect(resolveWeight('extra-bold')).toBe(800));
    it("'black' → 900", () => expect(resolveWeight('black')).toBe(900));
  });

  describe('numeric pass-through', () => {
    it('400 → 400', () => expect(resolveWeight(400)).toBe(400));
    it('700 → 700', () => expect(resolveWeight(700)).toBe(700));
    it('100 → 100', () => expect(resolveWeight(100)).toBe(100));
    it('900 → 900', () => expect(resolveWeight(900)).toBe(900));
    it('custom value 350 → 350', () => expect(resolveWeight(350)).toBe(350));
  });
});
