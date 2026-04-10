import { describe, it, expect } from 'vitest';
import { defineStyles, defineCharStyles } from '../src/index.js';

// ─── ROADMAP example — verbatim ───────────────────────────────────────────────

const styles = defineStyles({
  defaults: {
    font: { family: 'SourceSerif4', size: 10, weight: 400, style: 'normal' },
    language: 'en-us',
    alignment: 'justified',
    lineHeight: 14,
    hyphenation: true,
  },
  body: {
    extends: 'defaults',
    spaceBefore: 0,
    spaceAfter: 4,
  },
  heading: {
    extends: 'defaults',
    font: { size: 18, weight: 700 },
    alignment: 'left',
    spaceBefore: 18,
    spaceAfter: 8,
    hyphenation: false,
    next: 'body',
  },
  caption: {
    extends: 'body',
    font: { size: 8 },
    alignment: 'left',
  },
});

describe('integration — ROADMAP example (paragraph styles)', () => {
  it('heading.font.family inherited from defaults even though heading.font only sets size + weight', () => {
    expect(styles.resolve('heading').font.family).toBe('SourceSerif4');
  });

  it('heading.font.size is 18', () => {
    expect(styles.resolve('heading').font.size).toBe(18);
  });

  it('heading.font.weight is 700', () => {
    expect(styles.resolve('heading').font.weight).toBe(700);
  });

  it('heading.hyphenation is false', () => {
    expect(styles.resolve('heading').hyphenation).toBe(false);
  });

  it('heading.next is body', () => {
    expect(styles.resolve('heading').next).toBe('body');
  });

  it('caption.font.size is 8', () => {
    expect(styles.resolve('caption').font.size).toBe(8);
  });

  it('caption.alignment is left', () => {
    expect(styles.resolve('caption').alignment).toBe('left');
  });

  it('caption.spaceAfter inherits 4 from body through two chain levels', () => {
    expect(styles.resolve('caption').spaceAfter).toBe(4);
  });

  it('caption.font.family inherited from defaults through body and caption chain', () => {
    expect(styles.resolve('caption').font.family).toBe('SourceSerif4');
  });

  it('body.spaceBefore is 0', () => {
    expect(styles.resolve('body').spaceBefore).toBe(0);
  });

  it('defaults.language is en-us', () => {
    expect(styles.resolve('defaults').language).toBe('en-us');
  });

  it('body.font.family is inherited from defaults', () => {
    expect(styles.resolve('body').font.family).toBe('SourceSerif4');
  });

  it('heading.spaceBefore is 18', () => {
    expect(styles.resolve('heading').spaceBefore).toBe(18);
  });

  it('heading.spaceAfter is 8', () => {
    expect(styles.resolve('heading').spaceAfter).toBe(8);
  });
});

describe('integration — character styles', () => {
  const chars = defineCharStyles({
    emphasis: { font: { style: 'italic' } },
    bold: { font: { weight: 700 } },
    highlight: { color: '#ffff00' },
  });

  it('emphasis resolves font.style to italic', () => {
    expect(chars.resolve('emphasis').font.style).toBe('italic');
  });

  it('bold resolves font.weight to 700', () => {
    expect(chars.resolve('bold').font.weight).toBe(700);
  });

  it('highlight resolves color', () => {
    expect(chars.resolve('highlight').color).toBe('#ffff00');
  });

  it('all char style names are returned', () => {
    expect(chars.names().sort()).toEqual(['bold', 'emphasis', 'highlight']);
  });
});
