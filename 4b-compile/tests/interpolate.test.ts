import { describe, it, expect } from 'vitest';
import { resolveText } from '../src/interpolate.js';

describe('resolveText', () => {
  // ─── Literal-only ────────────────────────────────────────────────────────

  it('returns plain text unchanged', () => {
    expect(resolveText('Hello, world!', {})).toBe('Hello, world!');
  });

  it('returns empty string for empty text', () => {
    expect(resolveText('', {})).toBe('');
  });

  // ─── Single binding ───────────────────────────────────────────────────────

  it('resolves a single binding at the top level', () => {
    expect(resolveText('{{name}}', { name: 'Alice' })).toBe('Alice');
  });

  it('resolves a nested dot-path binding', () => {
    expect(
      resolveText('{{product.sku}}', { product: { sku: 'ABC-001' } }),
    ).toBe('ABC-001');
  });

  it('resolves a deeply nested path', () => {
    expect(resolveText('{{a.b.c}}', { a: { b: { c: 42 } } })).toBe('42');
  });

  // ─── Mixed literal + binding ──────────────────────────────────────────────

  it('resolves mixed literal + binding text', () => {
    const result = resolveText('SKU: {{product.sku}}', {
      product: { sku: 'X99' },
    });
    expect(result).toBe('SKU: X99');
  });

  it('resolves multiple bindings in one string', () => {
    const r = resolveText('{{first}} {{last}}', { first: 'Jane', last: 'Doe' });
    expect(r).toBe('Jane Doe');
  });

  // ─── Type coercion ────────────────────────────────────────────────────────

  it('coerces numeric values to string', () => {
    expect(resolveText('Price: {{price}}', { price: 9.99 })).toBe(
      'Price: 9.99',
    );
  });

  it('coerces boolean values to string', () => {
    expect(resolveText('{{flag}}', { flag: true })).toBe('true');
  });

  // ─── Missing data → null ──────────────────────────────────────────────────

  it('returns null when a binding key is missing', () => {
    expect(resolveText('{{name}}', {})).toBeNull();
  });

  it('returns null when a nested path is missing', () => {
    expect(resolveText('{{product.sku}}', { product: {} })).toBeNull();
  });

  it('returns null when a binding resolves to undefined', () => {
    expect(resolveText('{{x}}', { x: undefined })).toBeNull();
  });

  it('returns null when a binding resolves to null', () => {
    expect(resolveText('{{x}}', { x: null })).toBeNull();
  });

  it('returns null when any binding in a mixed string is missing', () => {
    expect(resolveText('{{first}} {{last}}', { first: 'Jane' })).toBeNull();
  });

  // ─── Path traversal edge cases ────────────────────────────────────────────

  it('returns null when a path segment traverses a non-object', () => {
    expect(resolveText('{{a.b}}', { a: 'string' })).toBeNull();
  });

  it('resolves numeric index segment', () => {
    expect(resolveText('{{items.0}}', { items: { 0: 'first' } })).toBe('first');
  });
});

// ─── F032: conditional null-guard — {{?path}} ────────────────────────────────

describe('resolveText — F032: conditional null-guard tokens', () => {
  it('{{?key}} resolves to value when key is present', () => {
    expect(resolveText('{{?subtitle}}', { subtitle: 'A Fine Subtitle' })).toBe(
      'A Fine Subtitle',
    );
  });

  it('{{?key}} resolves to empty string when key is missing', () => {
    expect(resolveText('{{?subtitle}}', {})).toBe('');
  });

  it('{{?key}} missing does NOT null out the whole slot', () => {
    const result = resolveText('{{?subtitle}}', {});
    expect(result).not.toBeNull();
    expect(result).toBe('');
  });

  it('missing conditional does not null slot; missing binding does', () => {
    // The binding {{title}} is missing → whole slot returns null.
    expect(
      resolveText('{{title}} {{?subtitle}}', { subtitle: 'ok' }),
    ).toBeNull();

    // The conditional {{?subtitle}} is missing but binding {{title}} is present.
    expect(resolveText('{{title}} {{?subtitle}}', { title: 'T' })).toBe('T ');
  });
});
