import { describe, it, expect } from 'vitest';
import { defineStyles } from '../src/index.js';

describe('defineStyles — construction', () => {
  it('empty registry does not throw', () => {
    expect(() => defineStyles({})).not.toThrow();
  });

  it('single style with no extends resolves to built-in defaults for unset fields', () => {
    const styles = defineStyles({ body: {} });
    const r = styles.resolve('body');
    expect(r.font.family).toBe('');
    expect(r.font.size).toBe(10);
    expect(r.font.weight).toBe(400);
    expect(r.font.style).toBe('normal');
    expect(r.font.letterSpacing).toBe(0);
    expect(r.language).toBe('en-us');
    expect(r.alignment).toBe('justified');
    expect(r.lineHeight).toBe(14);
    expect(r.hyphenation).toBe(true);
    expect(r.spaceBefore).toBe(0);
    expect(r.spaceAfter).toBe(0);
    expect(r.firstLineIndent).toBe(0);
    expect(r.tolerance).toBe(2);
    expect(r.looseness).toBe(0);
    expect(r.next).toBeUndefined();
  });

  it('font.family set in root style appears in resolved output', () => {
    const styles = defineStyles({ root: { font: { family: 'Garamond' } } });
    expect(styles.resolve('root').font.family).toBe('Garamond');
  });

  it('registry with only defaults style resolves correctly', () => {
    const styles = defineStyles({
      defaults: { font: { family: 'Helvetica', size: 12 } },
    });
    const r = styles.resolve('defaults');
    expect(r.font.family).toBe('Helvetica');
    expect(r.font.size).toBe(12);
  });

  it('throws when extends targets an undefined style', () => {
    expect(() => defineStyles({ child: { extends: 'ghost' } })).toThrow(
      /extends "ghost" which is not defined/,
    );
  });

  it('throws on direct circular inheritance (a extends b, b extends a)', () => {
    expect(() =>
      defineStyles({
        a: { extends: 'b' },
        b: { extends: 'a' },
      }),
    ).toThrow(/[Cc]ircular/);
  });

  it('throws on self-referential style', () => {
    expect(() => defineStyles({ loop: { extends: 'loop' } })).toThrow(
      /[Cc]ircular/,
    );
  });
});

describe('resolve — inheritance and merging', () => {
  it('child overrides alignment; parent value is replaced', () => {
    const styles = defineStyles({
      parent: { alignment: 'justified' },
      child: { extends: 'parent', alignment: 'left' },
    });
    expect(styles.resolve('child').alignment).toBe('left');
  });

  it('child font merged field-by-field with parent font', () => {
    const styles = defineStyles({
      parent: { font: { family: 'Times', size: 10, weight: 400 } },
      child: { extends: 'parent', font: { size: 18, weight: 700 } },
    });
    const r = styles.resolve('child');
    expect(r.font.family).toBe('Times');
    expect(r.font.size).toBe(18);
    expect(r.font.weight).toBe(700);
  });

  it('three-level chain: grandchild inherits grandparent field not overridden', () => {
    const styles = defineStyles({
      a: { language: 'de', lineHeight: 16 },
      b: { extends: 'a', lineHeight: 18 },
      c: { extends: 'b', alignment: 'left' },
    });
    const r = styles.resolve('c');
    expect(r.language).toBe('de'); // from a
    expect(r.lineHeight).toBe(18); // from b
    expect(r.alignment).toBe('left'); // from c
  });

  it('spaceBefore and spaceAfter default to 0 when never set', () => {
    const styles = defineStyles({
      a: { font: { family: 'Foo' } },
      b: { extends: 'a' },
    });
    const r = styles.resolve('b');
    expect(r.spaceBefore).toBe(0);
    expect(r.spaceAfter).toBe(0);
  });

  it('hyphenation: false on heading is preserved', () => {
    const styles = defineStyles({
      defaults: { hyphenation: true },
      heading: { extends: 'defaults', hyphenation: false },
    });
    expect(styles.resolve('heading').hyphenation).toBe(false);
  });

  it('next is present in resolved output when declared', () => {
    const styles = defineStyles({
      body: {},
      heading: { next: 'body' },
    });
    expect(styles.resolve('heading').next).toBe('body');
  });

  it('next is undefined when not declared anywhere in the chain', () => {
    const styles = defineStyles({
      root: {},
      child: { extends: 'root' },
    });
    expect(styles.resolve('child').next).toBeUndefined();
  });

  it('tolerance and looseness default to built-in values', () => {
    const styles = defineStyles({ plain: {} });
    const r = styles.resolve('plain');
    expect(r.tolerance).toBe(2);
    expect(r.looseness).toBe(0);
  });

  it('lineHeight set on root is inherited by all descendants', () => {
    const styles = defineStyles({
      root: { lineHeight: 20 },
      mid: { extends: 'root' },
      leaf: { extends: 'mid' },
    });
    expect(styles.resolve('leaf').lineHeight).toBe(20);
  });

  it('resolving the same style twice yields equal objects', () => {
    const styles = defineStyles({
      body: { font: { family: 'Serif' }, lineHeight: 14 },
    });
    expect(styles.resolve('body')).toEqual(styles.resolve('body'));
  });
});

describe('registry.get and registry.names', () => {
  it('.get returns undefined for unknown name', () => {
    const styles = defineStyles({ body: {} });
    expect(styles.get('missing')).toBeUndefined();
  });

  it('.get returns the raw unresolved definition', () => {
    const def = { font: { size: 18 }, hyphenation: false };
    const styles = defineStyles({ heading: def });
    expect(styles.get('heading')).toEqual(def);
  });

  it('.names returns all defined style names', () => {
    const styles = defineStyles({ a: {}, b: {}, c: {} });
    expect(styles.names().sort()).toEqual(['a', 'b', 'c']);
  });

  it('resolve throws for unknown style name', () => {
    const styles = defineStyles({});
    expect(() => styles.resolve('ghost')).toThrow(/"ghost"/);
  });
});
