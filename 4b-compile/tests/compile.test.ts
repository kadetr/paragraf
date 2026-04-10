// compile.test.ts — Integration tests for compile() and compileBatch().
//
// Uses real Liberation Serif fonts from the monorepo's /fonts/ directory.

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compile } from '../src/compile.js';
import { compileBatch } from '../src/batch.js';
import type { CompileOptions } from '../src/types.js';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

// ─── Shared template fixture ─────────────────────────────────────────────────

function makeTemplate() {
  return defineTemplate({
    layout: {
      size: 'A4',
      margins: 72, // 1 inch
    },
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
        spaceAfter: 12,
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
  title: 'The Quick Brown Fox',
  body: 'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful, but the youngest was so beautiful that the sun itself was astonished whenever it shone in her face.',
};

// ─── compile() — output: 'rendered' ─────────────────────────────────────────

describe('compile() — rendered output', () => {
  it('returns a RenderedDocument with at least one page', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'rendered',
    });
    expect(result.metadata.pageCount).toBeGreaterThan(0);
    const doc = result.data as any;
    expect(doc.pages).toBeDefined();
    expect(doc.pages.length).toBe(result.metadata.pageCount);
  });

  it('reports shapingEngine as wasm or fontkit', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'rendered',
    });
    expect(['wasm', 'fontkit']).toContain(result.metadata.shapingEngine);
  });

  it('reports zero overflowLines for short content', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'rendered',
    });
    expect(result.metadata.overflowLines).toBe(0);
  });

  it('honours the fontkit shaping mode', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(result.metadata.shapingEngine).toBe('fontkit');
  });
});

// ─── compile() — output: 'pdf' ───────────────────────────────────────────────

describe('compile() — pdf output', () => {
  it('returns a non-empty Buffer', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });
    expect(result.data).toBeInstanceOf(Buffer);
    expect((result.data as Buffer).length).toBeGreaterThan(100);
  });

  it('PDF buffer starts with %PDF- magic bytes', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });
    const buf = result.data as Buffer;
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});

// ─── compile() — output: 'svg' ───────────────────────────────────────────────

describe('compile() — svg output', () => {
  it('returns a non-empty string starting with <svg', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
    });
    expect(typeof result.data).toBe('string');
    expect((result.data as string).startsWith('<svg')).toBe(true);
  });
});

// ─── compile() — onMissing handling ──────────────────────────────────────────

describe('compile() — onMissing behaviour', () => {
  it('skips slots when binding is missing (onMissing: skip, default)', async () => {
    const result = await compile({
      template: defineTemplate({
        layout: { size: 'A4', margins: 72 },
        fonts: {
          'Liberation Serif': {
            regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
          },
        },
        styles: {
          body: {
            font: { family: 'Liberation Serif', size: 12 },
            lineHeight: 18,
            alignment: 'left',
          },
        },
        content: [
          { style: 'body', text: '{{missing}}' },
          { style: 'body', text: 'present' },
        ],
      }),
      data: {},
      output: 'rendered',
      shaping: 'fontkit',
    });
    // Should compile with at least the 'present' slot
    expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('uses fallbackText when onMissing is fallback', async () => {
    const result = await compile({
      template: defineTemplate({
        layout: { size: 'A4', margins: 72 },
        fonts: {
          'Liberation Serif': {
            regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
          },
        },
        styles: {
          body: {
            font: { family: 'Liberation Serif', size: 12 },
            lineHeight: 18,
            alignment: 'left',
          },
        },
        content: [
          {
            style: 'body',
            text: '{{missing}}',
            onMissing: 'fallback',
            fallbackText: 'fallback text',
          },
        ],
      }),
      data: {},
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('renders a visible placeholder when onMissing is placeholder', async () => {
    const result = await compile({
      template: defineTemplate({
        layout: { size: 'A4', margins: 72 },
        fonts: {
          'Liberation Serif': {
            regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
          },
        },
        styles: {
          body: {
            font: { family: 'Liberation Serif', size: 12 },
            lineHeight: 18,
            alignment: 'left',
          },
        },
        content: [
          { style: 'body', text: '{{missing}}', onMissing: 'placeholder' },
        ],
      }),
      data: {},
      output: 'rendered',
      shaping: 'fontkit',
    });
    // placeholder '[body]' is rendered — document has content
    expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── compile() — onOverflow ───────────────────────────────────────────────────

describe('compile() — overflow handling', () => {
  it('silently truncates when maxPages is exceeded (default silent)', async () => {
    const longBody = 'word '.repeat(5000);
    const result = await compile({
      template: makeTemplate(),
      data: { title: 'Overflow Test', body: longBody },
      output: 'rendered',
      shaping: 'fontkit',
      maxPages: 2,
    });
    // Only 2 pages generated; overflow reported
    expect(result.metadata.pageCount).toBeLessThanOrEqual(2);
    expect(result.metadata.overflowLines).toBeGreaterThan(0);
  });

  it('throws when onOverflow is throw and content overflows', async () => {
    const longBody = 'word '.repeat(5000);
    await expect(
      compile({
        template: makeTemplate(),
        data: { title: 'Overflow Test', body: longBody },
        output: 'rendered',
        shaping: 'fontkit',
        maxPages: 1,
        onOverflow: 'throw',
      }),
    ).rejects.toThrow(/overflow/i);
  });
});

// ─── compile() — normalize ────────────────────────────────────────────────────

describe('compile() — normalize option', () => {
  it('applies normalize before binding resolution', async () => {
    type Raw = { ProductName: string; Description: string };
    const result = await compile<Raw>({
      template: makeTemplate(),
      data: { ProductName: 'Widget', Description: 'A useful widget.' },
      normalize: (raw) => ({ title: raw.ProductName, body: raw.Description }),
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(result.metadata.pageCount).toBeGreaterThan(0);
  });
});

// ─── compile() — empty content ───────────────────────────────────────────────

describe('compile() — empty content', () => {
  it('returns pageCount 0 and empty RenderedDocument when all slots are skipped', async () => {
    const result = await compile({
      template: defineTemplate({
        layout: { size: 'A4', margins: 72 },
        fonts: {
          'Liberation Serif': {
            regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
          },
        },
        styles: {
          body: {
            font: { family: 'Liberation Serif', size: 12 },
            lineHeight: 18,
            alignment: 'left',
          },
        },
        content: [
          { style: 'body', text: '{{missing}}' }, // will be skipped
        ],
      }),
      data: {},
      output: 'rendered',
      shaping: 'fontkit',
    });
    expect(result.metadata.pageCount).toBe(0);
  });
});

// ─── compile() — font validation ─────────────────────────────────────────────

describe('compile() — font validation', () => {
  it('throws a clear error when a style has no font.family set', async () => {
    await expect(
      compile({
        template: defineTemplate({
          layout: { size: 'A4', margins: 72 },
          fonts: {
            'Liberation Serif': {
              regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
            },
          },
          styles: {
            // font.family intentionally omitted — resolves to '' from DEFAULTS
            body: { font: { size: 12 }, lineHeight: 18, alignment: 'left' },
          },
          content: [{ style: 'body', text: 'Hello world.' }],
        }),
        data: {},
        output: 'rendered',
        shaping: 'fontkit',
      }),
    ).rejects.toThrow(/Style "body": font\.family is not set/);
  });
});

// ─── compile() — maxPages validation ─────────────────────────────────────────

describe('compile() — maxPages validation', () => {
  it('throws RangeError when maxPages is 0', async () => {
    await expect(
      compile({ template: makeTemplate(), data: SAMPLE_DATA, maxPages: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it('throws RangeError when maxPages is negative', async () => {
    await expect(
      compile({ template: makeTemplate(), data: SAMPLE_DATA, maxPages: -5 }),
    ).rejects.toThrow(/maxPages must be >= 1/);
  });
});

// ─── compileBatch() ───────────────────────────────────────────────────────────

describe('compileBatch()', () => {
  const records = [
    { title: 'Doc 1', body: 'First document body text.' },
    { title: 'Doc 2', body: 'Second document body text.' },
    { title: 'Doc 3', body: 'Third document body text.' },
  ];

  let baseOptions: Omit<CompileOptions, 'data'>;

  beforeAll(() => {
    baseOptions = {
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
    };
  });

  it('returns one result per record', async () => {
    const results = await compileBatch({ ...baseOptions, records });
    expect(results).toHaveLength(3);
  });

  it('each result has the corresponding record attached', async () => {
    const results = await compileBatch({ ...baseOptions, records });
    for (let i = 0; i < records.length; i++) {
      expect(results[i].record).toBe(records[i]);
      expect(results[i].index).toBe(i);
    }
  });

  it('all results succeed', async () => {
    const results = await compileBatch({ ...baseOptions, records });
    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.result).toBeDefined();
    }
  });

  it('collects errors without aborting the batch', async () => {
    // Use onOverflow: 'throw' + maxPages: 1 so the middle record (very long)
    // genuinely throws while the surrounding short records succeed.
    const mixedRecords = [
      { title: 'Short 1', body: 'First short record.' },
      { title: 'Long', body: 'word '.repeat(5000) }, // overflows maxPages: 1
      { title: 'Short 2', body: 'Third short record.' },
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
    expect(results[0]!.result).toBeDefined();
    expect(results[1]!.error).toBeDefined();
    expect(results[1]!.error!.message).toMatch(/overflow/i);
    expect(results[2]!.error).toBeUndefined();
    expect(results[2]!.result).toBeDefined();
  });

  it('calls onProgress after each record', async () => {
    const calls: [number, number][] = [];
    await compileBatch({
      ...baseOptions,
      records,
      onProgress: (completed, total) => calls.push([completed, total]),
    });
    expect(calls).toHaveLength(3);
    expect(calls[calls.length - 1]).toEqual([3, 3]);
    // progress should be monotonically increasing
    const completedValues = calls.map(([c]) => c);
    for (let i = 1; i < completedValues.length; i++) {
      expect(completedValues[i]).toBeGreaterThan(completedValues[i - 1]!);
    }
  });

  it('respects concurrency limit (smoke test — no deadlock)', async () => {
    const bigBatch = Array.from({ length: 8 }, (_, i) => ({
      title: `Doc ${i + 1}`,
      body: 'Short body text.',
    }));
    const results = await compileBatch({
      ...baseOptions,
      records: bigBatch,
      concurrency: 2,
    });
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.result !== undefined)).toBe(true);
  });
});
