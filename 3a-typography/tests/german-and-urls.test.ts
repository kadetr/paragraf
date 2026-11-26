// german-and-urls.test.ts
//
// v0.7.1, at the compose() level, with real fonts and both engines:
//   - German capitalised nouns are hyphenated by default, so long compounds
//     no longer stick out of a narrow column;
//   - a URL can break after / ? & = # _ - and before a dot, without a hyphen.
// Words are built in TypeScript for both engines; only the breaker differs.

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import {
  createParagraphComposer,
  ParagraphComposer,
  wasmStatus,
} from '@paragraf/typography';
import { FontRegistry, Font, ComposedLine } from '@paragraf/types';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const FONT: Font = {
  id: 'liberation-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};
const BOLD: Font = { ...FONT, id: 'liberation-bold', weight: 700 };
const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      family: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
  [
    'liberation-bold',
    {
      id: 'liberation-bold',
      family: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
    },
  ],
]);

const URL =
  'https://example.com/a/very/long/path/that/cannot/be/hyphenated/anywhere/index.html';
const URL_TEXT = `The report is published at ${URL} and is updated every week.`;

const GERMAN =
  'Die Donaudampfschifffahrtsgesellschaft und das ' +
  'Rindfleischetikettierungsüberwachungsgesetz sowie die ' +
  'Rechtsschutzversicherungsgesellschaften stehen im ' +
  'Bundesausbildungsförderungsgesetz nebeneinander.';

/** The paragraph text as set: line-end hyphens removed, lines joined. */
const textOf = (lines: ComposedLine[]): string =>
  lines
    .map((l) => {
      const t = l.words.join(' ');
      return l.hyphenated ? t.slice(0, -1) : t + ' ';
    })
    .join('')
    .trim();

// `shaping: 'wasm'` fails when the binary is not built, so the WASM half is
// skipped then instead of quietly running the TypeScript engine twice.
const WASM_ABSENT = wasmStatus().status !== 'loaded';

for (const shaping of ['wasm', 'fontkit'] as const) {
  const describeEngine = describe.skipIf(shaping === 'wasm' && WASM_ABSENT);
  describeEngine(
    `German and URLs in compose() — ${shaping === 'wasm' ? 'WASM' : 'TypeScript'} engine`,
    () => {
      let composer: ParagraphComposer;

      beforeAll(async () => {
        composer = await createParagraphComposer(REGISTRY, { shaping });
        await composer.ensureLanguage('de');
      });

      // ── German ───────────────────────────────────────────────────────────

      it('long German compounds in a narrow column: no overfull line', () => {
        const out = composer.compose({
          text: GERMAN,
          font: FONT,
          lineWidth: 120,
          tolerance: 3,
          language: 'de',
        });
        expect(out.lines.filter((l) => l.overfull)).toEqual([]);
        // Each of the four compounds is wider than the column, so each is
        // hyphenated at least once.
        expect(
          out.lines.filter((l) => l.hyphenated).length,
        ).toBeGreaterThanOrEqual(4);
        expect(textOf(out.lines)).toBe(GERMAN);
        for (const l of out.lines) {
          expect(l.overflow).toBeUndefined();
        }
      });

      it('the same text with hyphenation off still reports the four compounds', () => {
        const out = composer.compose({
          text: GERMAN,
          font: FONT,
          lineWidth: 120,
          tolerance: 3,
          language: 'de',
          hyphenation: false,
        });
        expect(out.lines.filter((l) => l.overfull).map((l) => l.words)).toEqual(
          [
            ['Donaudampfschifffahrtsgesellschaft'],
            ['Rindfleischetikettierungsüberwachungsgesetz'],
            ['Rechtsschutzversicherungsgesellschaften'],
            ['Bundesausbildungsförderungsgesetz'],
          ],
        );
      });

      it('English still leaves a capitalised word in mid-sentence whole', () => {
        const out = composer.compose({
          text: 'We travelled from Northamptonshire to Buckinghamshire and back again',
          font: FONT,
          lineWidth: 60,
          tolerance: 3,
        });
        const overfull = out.lines
          .filter((l) => l.overfull)
          .map((l) => l.words);
        expect(overfull).toEqual([['Northamptonshire'], ['Buckinghamshire']]);
      });

      // ── URLs ─────────────────────────────────────────────────────────────

      it('a URL wider than the measure is broken: no overfull line, no hyphen', () => {
        const out = composer.compose({
          text: URL_TEXT,
          font: FONT,
          lineWidth: 200,
          tolerance: 2,
        });
        expect(out.lines.filter((l) => l.overfull)).toEqual([]);

        const texts = out.lines.map((l) => l.words.join(' '));
        const first = texts.findIndex((t) => t.includes('https://'));
        const last = texts.findIndex((t) => t.includes('index.html'));
        expect(last).toBeGreaterThan(first);
        for (let i = first; i < last; i++) {
          expect(out.lines[i].hyphenated).toBe(false);
          // The break rule: a line inside the URL ends after one of
          // / ? & = # _ - or the next line begins with the dot.
          const endsAfterSeparator = /[/?&=#_-]$/.test(texts[i]);
          const nextStartsWithDot = texts[i + 1].startsWith('.');
          expect(
            endsAfterSeparator || nextStartsWithDot,
            `"${texts[i]}" | "${texts[i + 1]}"`,
          ).toBe(true);
          // Never inside "://".
          expect(texts[i]).not.toMatch(/https?:\/?$/);
        }
        // No character was added or lost.
        let joined = texts[first].slice(texts[first].indexOf('https://'));
        for (let i = first + 1; i <= last; i++) joined += texts[i];
        expect(joined.startsWith(URL)).toBe(true);
        expect(texts.join(' ').replaceAll(' ', '')).toBe(
          URL_TEXT.replaceAll(' ', ''),
        );
      });

      it('every line of a broken URL fits the measure', () => {
        const out = composer.compose({
          text: URL_TEXT,
          font: FONT,
          lineWidth: 200,
          tolerance: 2,
        });
        for (const l of out.lines) {
          const natural =
            l.words.reduce(
              (sum, w) => sum + composer.measurer!.measure(w, FONT),
              0,
            ) +
            (l.words.length - 1) * l.wordSpacing;
          expect(natural).toBeLessThanOrEqual(200 + 0.01);
        }
      });

      it('a URL that fits on one line is one word', () => {
        const out = composer.compose({
          text: URL_TEXT,
          font: FONT,
          lineWidth: 2000,
          tolerance: 2,
        });
        expect(out.lines.length).toBe(1);
        expect(out.lines[0].words).toEqual(URL_TEXT.split(' '));
      });

      it('a URL in span input is broken the same way', () => {
        const out = composer.compose({
          spans: [
            { text: 'The report is published at ', font: FONT },
            { text: 'https://example.com/a/very/long/', font: BOLD },
            {
              text: 'path/that/cannot/be/hyphenated/anywhere/index.html and is updated every week.',
              font: FONT,
            },
          ],
          lineWidth: 200,
          tolerance: 2,
        });
        expect(out.lines.filter((l) => l.overfull)).toEqual([]);
        const texts = out.lines.map((l) => l.words.join(' '));
        expect(texts.join(' ').replaceAll(' ', '')).toBe(
          URL_TEXT.replaceAll(' ', ''),
        );
        const first = texts.findIndex((t) => t.includes('https://'));
        const last = texts.findIndex((t) => t.includes('index.html'));
        expect(last).toBeGreaterThan(first);
        for (let i = first; i < last; i++) {
          expect(out.lines[i].hyphenated).toBe(false);
        }
      });

      it('hyphenation: false keeps a URL in one piece', () => {
        const out = composer.compose({
          text: URL_TEXT,
          font: FONT,
          lineWidth: 200,
          tolerance: 2,
          hyphenation: false,
        });
        const overfull = out.lines.filter((l) => l.overfull);
        expect(overfull.map((l) => l.words)).toEqual([[URL]]);
      });
    },
  );
}

// ── The two engines choose the same breaks ───────────────────────────────────

const describeBoth = describe.skipIf(WASM_ABSENT);

describeBoth('German and URLs — WASM and TypeScript engines agree', () => {
  it('same words on every line', async () => {
    const wasm = await createParagraphComposer(REGISTRY, { shaping: 'wasm' });
    const ts = await createParagraphComposer(REGISTRY, { shaping: 'fontkit' });
    await wasm.ensureLanguage('de');
    await ts.ensureLanguage('de');

    for (const input of [
      { text: URL_TEXT, font: FONT, lineWidth: 200, tolerance: 2 },
      { text: URL_TEXT, font: FONT, lineWidth: 150, tolerance: 3 },
      {
        text: GERMAN,
        font: FONT,
        lineWidth: 120,
        tolerance: 3,
        language: 'de' as const,
      },
      {
        text: GERMAN,
        font: FONT,
        lineWidth: 200,
        tolerance: 2,
        language: 'de' as const,
      },
    ]) {
      const a = wasm.compose(input);
      const b = ts.compose(input);
      expect(a.lines.map((l) => l.words)).toEqual(b.lines.map((l) => l.words));
      expect(a.lines.map((l) => l.overfull === true)).toEqual(
        b.lines.map((l) => l.overfull === true),
      );
      expect(a.usedFallback).toBe(b.usedFallback);
    }
  });
});
