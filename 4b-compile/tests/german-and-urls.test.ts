// german-and-urls.test.ts — compile() level, v0.7.1.
//
// A narrow column (195 pt) with a long URL, and one with long German nouns,
// used to produce overfull lines. Both now compile with none:
//   - a URL breaks after / ? & = # _ - and before a dot, without a hyphen;
//   - German capitalised nouns are hyphenated.
// `hyphenation: false` on the style keeps both in one piece, as before.

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import * as typography from '@paragraf/typography';
import { compile } from '../src/compile.js';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

const LONG_URL =
  'https://example.com/a/very/long/path/that/cannot/be/hyphenated/anywhere/index.html';

// A4 with 200 pt margins leaves a 195 pt column.
const narrowTemplate = (style: Record<string, unknown> = {}) =>
  defineTemplate({
    layout: { size: 'A4', margins: 200 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'justified',
        lineHeight: 18,
        ...style,
      },
    },
    content: [
      { style: 'body', text: '{{intro}}' },
      { style: 'body', text: '{{body}}' },
    ],
  });

const english = {
  intro: 'A short first paragraph that sets without any trouble at all.',
  body: `The report is published at ${LONG_URL} and is updated every week.`,
};

const german = {
  intro:
    'Ein gewöhnlicher Absatz ohne Schwierigkeiten, der sich normal setzen lässt.',
  body:
    'Die Donaudampfschifffahrtsgesellschaftskapitänsmütze und das ' +
    'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz stehen nebeneinander.',
};

const wasmMissing = () => typography.wasmStatus().status !== 'loaded';

describe('compile() — a URL wider than the column', () => {
  for (const shaping of ['fontkit', 'wasm'] as const) {
    it.skipIf(shaping === 'wasm' && wasmMissing())(
      `no overfull line (${shaping})`,
      async () => {
        const result = await compile({
          template: narrowTemplate(),
          data: english,
          output: 'rendered',
          shaping,
          verbose: false,
        });
        expect(result.metadata.pageCount).toBe(1);
        expect(result.metadata.overfullLines).toEqual([]);
      },
    );
  }

  it('hyphenation: false on the style keeps the URL whole, and it is reported', async () => {
    const result = await compile({
      template: narrowTemplate({ hyphenation: false }),
      data: english,
      output: 'rendered',
      shaping: 'fontkit',
      verbose: false,
    });
    expect(result.metadata.overfullLines).toHaveLength(1);
    expect(result.metadata.overfullLines[0].text).toBe(LONG_URL);
    expect(result.metadata.overfullLines[0].paragraph).toBe(1);
  });

  it('a PDF comes out', async () => {
    const result = await compile({
      template: narrowTemplate(),
      data: english,
      output: 'pdf',
      shaping: 'fontkit',
      verbose: false,
    });
    expect((result.data as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.metadata.overfullLines).toEqual([]);
  });
});

describe('compile() — long German nouns in a narrow column', () => {
  for (const shaping of ['fontkit', 'wasm'] as const) {
    it.skipIf(shaping === 'wasm' && wasmMissing())(
      `no overfull line with language: 'de' (${shaping})`,
      async () => {
        const result = await compile({
          template: narrowTemplate({ language: 'de' }),
          data: german,
          output: 'rendered',
          shaping,
          verbose: false,
        });
        expect(result.metadata.pageCount).toBe(1);
        expect(result.metadata.overfullLines).toEqual([]);
      },
    );
  }

  it('hyphenation: false on the style reports both nouns', async () => {
    const result = await compile({
      template: narrowTemplate({ language: 'de', hyphenation: false }),
      data: german,
      output: 'rendered',
      shaping: 'fontkit',
      verbose: false,
    });
    expect(result.metadata.overfullLines.map((l) => l.text)).toEqual([
      'Donaudampfschifffahrtsgesellschaftskapitänsmütze',
      'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz',
    ]);
  });
});
