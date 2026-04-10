// e2e-compile.test.ts
//
// End-to-end tests for @paragraf/compile — exercises the full pipeline from
// defineTemplate() through compile() and compileBatch() to concrete outputs
// (PDF bytes, SVG string, RenderedDocument). Uses real Liberation Serif fonts
// from the monorepo /fonts/ directory.

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compile, compileBatch } from '@paragraf/compile';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../fonts');

function makeTemplate() {
  return defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
        bold: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
        italic: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
        boldItalic: path.join(FONTS_DIR, 'LiberationSerif-BoldItalic.ttf'),
      },
    },
    styles: {
      heading: {
        font: { family: 'Liberation Serif', size: 24, weight: 700 },
        alignment: 'left',
        lineHeight: 32,
      },
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'justified',
        lineHeight: 18,
      },
    },
    content: [
      { style: 'heading', text: '{{title}}' },
      { style: 'body', text: '{{body}}' },
    ],
  });
}

const SAMPLE_DATA = {
  title: 'End-to-End Test',
  body: 'The quick brown fox jumps over the lazy dog. '.repeat(20),
};

// ─── defineTemplate → compile → PDF ──────────────────────────────────────────

describe('e2e: defineTemplate → compile → PDF', () => {
  it('produces a valid PDF buffer', async () => {
    const { data, metadata } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });
    expect(data).toBeInstanceOf(Buffer);
    expect((data as Buffer).slice(0, 5).toString()).toBe('%PDF-');
    expect(metadata.pageCount).toBeGreaterThan(0);
    expect(metadata.overflowLines).toBe(0);
    expect(['wasm', 'fontkit']).toContain(metadata.shapingEngine);
  });

  it('pageCount matches pages in RenderedDocument', async () => {
    const rendered = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'rendered',
      shaping: 'fontkit',
    });
    const doc = rendered.data as any;
    expect(doc.pages.length).toBe(rendered.metadata.pageCount);
  });
});

// ─── defineTemplate → compile → SVG ──────────────────────────────────────────

describe('e2e: defineTemplate → compile → SVG', () => {
  it('produces a non-empty string starting with <svg', async () => {
    const { data, metadata } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
    });
    expect(typeof data).toBe('string');
    expect((data as string).startsWith('<svg')).toBe(true);
    expect(metadata.pageCount).toBeGreaterThan(0);
  });

  it('SVG output contains one <svg element per page', async () => {
    const { data, metadata } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
    });
    const svgCount = ((data as string).match(/<svg/g) ?? []).length;
    expect(svgCount).toBe(metadata.pageCount);
  });
});

// ─── overflow handling ────────────────────────────────────────────────────────

describe('e2e: overflow handling', () => {
  it('truncates to maxPages silently and reports overflowLines', async () => {
    const { metadata } = await compile({
      template: makeTemplate(),
      data: { title: 'Overflow', body: 'word '.repeat(5000) },
      output: 'rendered',
      shaping: 'fontkit',
      maxPages: 1,
    });
    expect(metadata.pageCount).toBe(1);
    expect(metadata.overflowLines).toBeGreaterThan(0);
  });

  it('throws when onOverflow is "throw"', async () => {
    await expect(
      compile({
        template: makeTemplate(),
        data: { title: 'Overflow', body: 'word '.repeat(5000) },
        output: 'rendered',
        shaping: 'fontkit',
        maxPages: 1,
        onOverflow: 'throw',
      }),
    ).rejects.toThrow(/overflow/i);
  });
});

// ─── normalize option ─────────────────────────────────────────────────────────

describe('e2e: normalize option', () => {
  it('reshapes raw data before binding resolution', async () => {
    type Raw = { Name: string; Content: string };
    const { metadata } = await compile<Raw>({
      template: makeTemplate(),
      data: { Name: 'Widget', Content: 'A useful product description.' },
      normalize: (raw) => ({ title: raw.Name, body: raw.Content }),
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(metadata.pageCount).toBeGreaterThan(0);
  });
});

// ─── compileBatch ─────────────────────────────────────────────────────────────

describe('e2e: compileBatch', () => {
  const records = [
    { title: 'Doc A', body: 'Body of document A.' },
    { title: 'Doc B', body: 'Body of document B.' },
    { title: 'Doc C', body: 'Body of document C.' },
  ];

  it('returns one result per record in order', async () => {
    const results = await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      records,
    });
    expect(results).toHaveLength(3);
    for (let i = 0; i < records.length; i++) {
      expect(results[i]!.index).toBe(i);
      expect(results[i]!.record).toBe(records[i]);
      expect(results[i]!.error).toBeUndefined();
      expect(results[i]!.result).toBeDefined();
    }
  });

  it('collects per-record errors without aborting the batch', async () => {
    const mixedRecords = [
      { title: 'Short A', body: 'First short document.' },
      { title: 'Overflow', body: 'word '.repeat(5000) }, // will throw
      { title: 'Short B', body: 'Third short document.' },
    ];
    const results = await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      maxPages: 1,
      onOverflow: 'throw',
      records: mixedRecords,
    });
    expect(results).toHaveLength(3);
    expect(results[0]!.error).toBeUndefined();
    expect(results[1]!.error).toBeDefined();
    expect(results[1]!.error!.message).toMatch(/overflow/i);
    expect(results[2]!.error).toBeUndefined();
  });
});
