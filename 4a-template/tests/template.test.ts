import { describe, it, expect } from 'vitest';
import { defineTemplate } from '../src/index.js';
import type { Template } from '../src/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL: Template = {
  layout: { size: 'A4', margins: '20mm' },
  fonts: { Serif: { regular: './fonts/Serif-Regular.ttf' } },
  styles: { body: { font: { family: 'Serif', size: 10 } } },
  content: [{ style: 'body', text: 'Hello world' }],
};

// ─── Valid templates ─────────────────────────────────────────────────────────

describe('defineTemplate — valid templates', () => {
  it('minimal template returns the same object', () => {
    const result = defineTemplate(MINIMAL);
    expect(result).toBe(MINIMAL);
  });

  it('template with a pure binding passes validation', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: '{{product.name}}' }],
      }),
    ).not.toThrow();
  });

  it('template with mixed literal+binding text passes', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: 'SKU: {{product.sku}}' }],
      }),
    ).not.toThrow();
  });

  it('onMissing: skip passes without fallbackText', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: '{{desc}}', onMissing: 'skip' }],
      }),
    ).not.toThrow();
  });

  it('onMissing: placeholder passes without fallbackText', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [
          { style: 'body', text: '{{desc}}', onMissing: 'placeholder' },
        ],
      }),
    ).not.toThrow();
  });

  it('onMissing: fallback with fallbackText passes', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [
          {
            style: 'body',
            text: '{{desc}}',
            onMissing: 'fallback',
            fallbackText: 'No description available.',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('numeric margin (points) is valid', () => {
    expect(() =>
      defineTemplate({ ...MINIMAL, layout: { size: 'A4', margins: 36 } }),
    ).not.toThrow();
  });

  it('per-side Dimension margin object is valid', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        layout: {
          size: 'A4',
          margins: { top: '20mm', right: '15mm', bottom: '20mm', left: '25mm' },
        },
      }),
    ).not.toThrow();
  });

  it('layout with gutter and bleed as Dimension strings', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        layout: {
          size: 'A4',
          margins: '20mm',
          columns: 2,
          gutter: '5mm',
          bleed: '3mm',
        },
      }),
    ).not.toThrow();
  });

  it('custom [width, height] tuple as page size', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        layout: { size: [400, 600], margins: 20 },
      }),
    ).not.toThrow();
  });

  it('multiple content slots with different styles', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        styles: {
          body: { font: { family: 'Serif', size: 10 } },
          heading: { extends: 'body', font: { size: 18 } },
        },
        content: [
          { style: 'heading', text: '{{product.name}}' },
          { style: 'body', text: '{{product.description}}', onMissing: 'skip' },
        ],
      }),
    ).not.toThrow();
  });

  it('empty content array is valid', () => {
    expect(() => defineTemplate({ ...MINIMAL, content: [] })).not.toThrow();
  });

  it('open font variant key is valid', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        fonts: {
          Serif: {
            regular: './fonts/Serif-Regular.ttf',
            light: './fonts/Serif-Light.ttf',
            semiBold: './fonts/Serif-SemiBold.ttf',
          },
        },
      }),
    ).not.toThrow();
  });

  it('multiple font families are valid', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        fonts: {
          Serif: { regular: './fonts/Serif.ttf' },
          Sans: { regular: './fonts/Sans.ttf', bold: './fonts/Sans-Bold.ttf' },
        },
      }),
    ).not.toThrow();
  });
});

// ─── Validation errors ───────────────────────────────────────────────────────

describe('defineTemplate — validation errors', () => {
  it('throws when content slot references undefined style', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'ghost', text: 'Hello' }],
      }),
    ).toThrow(/content\[0\]\.style "ghost"/);
  });

  it('error message includes slot index for later slots', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [
          { style: 'body', text: 'ok' },
          { style: 'missing', text: 'bad' },
        ],
      }),
    ).toThrow(/content\[1\]\.style "missing"/);
  });

  it('throws when onMissing is fallback without fallbackText', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: '{{x}}', onMissing: 'fallback' }],
      }),
    ).toThrow(/onMissing.*fallback.*fallbackText|fallbackText.*not set/i);
  });

  it('throws when text has unclosed {{', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: 'Hello {{name' }],
      }),
    ).toThrow(/Unclosed/);
  });

  it('throws on empty binding in text', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        content: [{ style: 'body', text: 'Hello {{}}' }],
      }),
    ).toThrow(/Empty binding/);
  });

  it('throws on circular style inheritance', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        styles: {
          a: { extends: 'b' },
          b: { extends: 'a' },
        },
        content: [],
      }),
    ).toThrow(/[Cc]ircular/);
  });

  it('throws on extends reference to missing style', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        styles: { child: { extends: 'ghost' } },
        content: [{ style: 'child', text: 'hi' }],
      }),
    ).toThrow(/extends "ghost"/);
  });

  it('throws on next reference to missing style', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        styles: { body: { next: 'ghost' } },
        content: [{ style: 'body', text: 'hi' }],
      }),
    ).toThrow(/next "ghost"/);
  });
});
