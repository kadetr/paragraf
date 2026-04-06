import { describe, it, expect } from 'vitest';
import { parseTokens } from '../src/interpolate.js';

describe('parseTokens — literal text', () => {
  it('empty string → empty array', () => {
    expect(parseTokens('')).toEqual([]);
  });

  it('plain string → one literal token', () => {
    expect(parseTokens('Hello world')).toEqual([
      { type: 'literal', value: 'Hello world' },
    ]);
  });

  it('single brace { is treated as literal', () => {
    expect(parseTokens('a{b')).toEqual([{ type: 'literal', value: 'a{b' }]);
  });

  it('single } is treated as literal', () => {
    expect(parseTokens('a}b')).toEqual([{ type: 'literal', value: 'a}b' }]);
  });

  it('{ at end of string is treated as literal', () => {
    expect(parseTokens('x{')).toEqual([{ type: 'literal', value: 'x{' }]);
  });
});

describe('parseTokens — binding tokens', () => {
  it('bare binding → single binding token', () => {
    expect(parseTokens('{{name}}')).toEqual([
      { type: 'binding', path: 'name' },
    ]);
  });

  it('nested dot path is preserved', () => {
    expect(parseTokens('{{product.name}}')).toEqual([
      { type: 'binding', path: 'product.name' },
    ]);
  });

  it('three-level path', () => {
    expect(parseTokens('{{a.b.c}}')).toEqual([
      { type: 'binding', path: 'a.b.c' },
    ]);
  });

  it('mixed literal prefix + binding', () => {
    expect(parseTokens('Article: {{sku}}')).toEqual([
      { type: 'literal', value: 'Article: ' },
      { type: 'binding', path: 'sku' },
    ]);
  });

  it('binding at start, literal at end', () => {
    expect(parseTokens('{{name}} Ltd.')).toEqual([
      { type: 'binding', path: 'name' },
      { type: 'literal', value: ' Ltd.' },
    ]);
  });

  it('literal — binding — literal', () => {
    expect(parseTokens('Hello {{name}}, welcome!')).toEqual([
      { type: 'literal', value: 'Hello ' },
      { type: 'binding', path: 'name' },
      { type: 'literal', value: ', welcome!' },
    ]);
  });

  it('two adjacent bindings', () => {
    expect(parseTokens('{{first}}{{last}}')).toEqual([
      { type: 'binding', path: 'first' },
      { type: 'binding', path: 'last' },
    ]);
  });

  it('two bindings separated by literal', () => {
    expect(parseTokens('{{product.name}} — SKU: {{product.sku}}')).toEqual([
      { type: 'binding', path: 'product.name' },
      { type: 'literal', value: ' — SKU: ' },
      { type: 'binding', path: 'product.sku' },
    ]);
  });

  it('whitespace around path is trimmed', () => {
    expect(parseTokens('{{ name }}')).toEqual([
      { type: 'binding', path: 'name' },
    ]);
  });

  it('numeric segment in path (array index)', () => {
    expect(parseTokens('{{items.0.price}}')).toEqual([
      { type: 'binding', path: 'items.0.price' },
    ]);
  });
});

describe('parseTokens — error cases', () => {
  it('unclosed {{ throws', () => {
    expect(() => parseTokens('Hello {{name')).toThrow(/Unclosed/);
  });

  it('unclosed {{ at start throws', () => {
    expect(() => parseTokens('{{name')).toThrow(/Unclosed/);
  });

  it('empty binding {{}} throws', () => {
    expect(() => parseTokens('Hello {{}}')).toThrow(/Empty binding/);
  });

  it('whitespace-only binding throws', () => {
    expect(() => parseTokens('{{   }}')).toThrow(/Empty binding/);
  });

  it('path starting with digit throws', () => {
    expect(() => parseTokens('{{2bad}}')).toThrow(/Invalid binding path/);
  });

  it('path with space throws', () => {
    expect(() => parseTokens('{{bad path}}')).toThrow(/Invalid binding path/);
  });

  it('path with hyphen throws', () => {
    expect(() => parseTokens('{{bad-path}}')).toThrow(/Invalid binding path/);
  });

  it('path with trailing dot throws', () => {
    expect(() => parseTokens('{{a.}}')).toThrow(/Invalid binding path/);
  });

  it('path with double dot throws', () => {
    expect(() => parseTokens('{{a..b}}')).toThrow(/Invalid binding path/);
  });
});
