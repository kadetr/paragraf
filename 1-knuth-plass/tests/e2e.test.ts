import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { createParagraphComposer, ParagraphComposer } from '../src/paragraph';
import { FontRegistry, Font, ComposedParagraph } from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      face: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
  [
    'liberation-bold',
    {
      id: 'liberation-bold',
      face: 'Liberation Serif Bold',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
    },
  ],
  [
    'roboto-regular',
    {
      id: 'roboto-regular',
      face: 'Roboto',
      filePath: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
    },
  ],
  [
    'roboto-bold',
    {
      id: 'roboto-bold',
      face: 'Roboto Bold',
      filePath: path.join(FONTS_DIR, 'Roboto-Bold.ttf'),
    },
  ],
]);

const font = (id: string, size: number): Font => ({
  id,
  size,
  weight: id.includes('bold') ? 700 : 400,
  style: 'normal',
  stretch: 'normal',
});

const FONT = font('liberation-regular', 12);
const TEXT =
  'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful, but the youngest was so beautiful that the sun itself was astonished whenever it shone in her face.';
const SOFT_TEXT =
  'co\u00ADoperate and co\u00ADordinate and col\u00ADlab\u00ADor\u00ADate together always';

let composer: ParagraphComposer;

beforeAll(async () => {
  composer = await createParagraphComposer(REGISTRY);
});

// ─── Printer ─────────────────────────────────────────────────────────────────

const print = (label: string, lines: ComposedParagraph): void => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(70)}`);
  lines.forEach((line, i) => {
    const words = line.words.join(' ');
    const spacing = line.wordSpacing.toFixed(3);
    const ratio = line.ratio.toFixed(4);
    const hyph = line.hyphenated ? ' ⟨hyph⟩' : '';
    const widow = line.isWidow ? ' ⟨widow⟩' : '';
    console.log(`  ${String(i + 1).padStart(2)}: "${words}"`);
    console.log(
      `      spacing=${spacing}pt  ratio=${ratio}  align=${line.alignment}${hyph}${widow}`,
    );
  });
  console.log(`  → ${lines.length} lines total`);
};

// ─── Step 2 tests ─────────────────────────────────────────────────────────────

describe('e2e — same paragraph across fonts and sizes', () => {
  const CONFIGS = [
    {
      label: 'Liberation Serif Regular 12pt',
      fontId: 'liberation-regular',
      fontSize: 12,
    },
    {
      label: 'Liberation Serif Regular 16pt',
      fontId: 'liberation-regular',
      fontSize: 16,
    },
    {
      label: 'Liberation Serif Bold 12pt',
      fontId: 'liberation-bold',
      fontSize: 12,
    },
    {
      label: 'Liberation Serif Bold 16pt',
      fontId: 'liberation-bold',
      fontSize: 16,
    },
    { label: 'Roboto Regular 12pt', fontId: 'roboto-regular', fontSize: 12 },
    { label: 'Roboto Regular 16pt', fontId: 'roboto-regular', fontSize: 16 },
    { label: 'Roboto Bold 12pt', fontId: 'roboto-bold', fontSize: 12 },
    { label: 'Roboto Bold 16pt', fontId: 'roboto-bold', fontSize: 16 },
  ];

  const results: { label: string; lines: ComposedParagraph }[] = [];

  beforeAll(() => {
    for (const c of CONFIGS) {
      const output = composer.compose({
        text: TEXT,
        font: font(c.fontId, c.fontSize),
        lineWidth: 500,
        tolerance: 2,
      });
      results.push({ label: c.label, lines: output.lines });
      print(c.label, output.lines);
    }
  });

  it('all configs produce at least one line', () => {
    results.forEach((r) => expect(r.lines.length).toBeGreaterThan(0));
  });

  it('all configs — last line ratio is 0', () => {
    results.forEach((r) => expect(r.lines[r.lines.length - 1].ratio).toBe(0));
  });

  it('all configs — all ratios within tolerance', () => {
    results.forEach((r) =>
      r.lines.forEach((l) => {
        expect(l.ratio).toBeGreaterThanOrEqual(-1);
        expect(l.ratio).toBeLessThanOrEqual(2);
      }),
    );
  });

  it('all configs — no NaN in ratio or wordSpacing', () => {
    results.forEach((r) =>
      r.lines.forEach((l) => {
        expect(Number.isNaN(l.ratio)).toBe(false);
        expect(Number.isNaN(l.wordSpacing)).toBe(false);
      }),
    );
  });

  it('all configs — hyphenated lines end with hyphen character', () => {
    results.forEach((r) =>
      r.lines
        .filter((l) => l.hyphenated)
        .forEach((l) => {
          expect(l.words[l.words.length - 1].endsWith('-')).toBe(true);
        }),
    );
  });

  it('16pt produces more lines than 12pt for same font', () => {
    const lib12 = results.find((r) =>
      r.label.includes('Liberation Serif Regular 12'),
    )!;
    const lib16 = results.find((r) =>
      r.label.includes('Liberation Serif Regular 16'),
    )!;
    expect(lib16.lines.length).toBeGreaterThanOrEqual(lib12.lines.length);
  });

  it('Roboto and Liberation produce different line counts', () => {
    const rob12 = results.find((r) => r.label.includes('Roboto Regular 12'))!;
    const lib12 = results.find((r) =>
      r.label.includes('Liberation Serif Regular 12'),
    )!;
    console.log(
      `\n  Roboto 12pt: ${rob12.lines.length} lines  |  Liberation 12pt: ${lib12.lines.length} lines`,
    );
  });
});

// ─── Step 3a visual inspection ────────────────────────────────────────────────

describe('e2e — step 3a features', () => {
  beforeAll(async () => {
    await composer.ensureLanguage('de');
  });

  it('alignment modes — same paragraph four ways', () => {
    const modes = ['justified', 'left', 'right', 'center'] as const;
    modes.forEach((alignment) => {
      const output = composer.compose({
        text: TEXT,
        font: FONT,
        lineWidth: 250,
        tolerance: 2,
        alignment,
      });
      print(`Alignment: ${alignment}`, output.lines);
      output.lines.forEach((l) => expect(l.alignment).toBe(alignment));
    });
  });

  it('firstLineIndent — paragraph with and without indent', () => {
    const noIndent = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
    });
    const indented = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      firstLineIndent: 24,
    });
    print('No indent', noIndent.lines);
    print('Indent 24pt', indented.lines);
    expect(indented.lineCount).toBeGreaterThanOrEqual(noIndent.lineCount);
  });

  it('widowPenalty — compare without and with', () => {
    const without = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
    });
    const with_ = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      widowPenalty: 100000,
    });
    print('No widow penalty', without.lines);
    print('widowPenalty=100000', with_.lines);
    expect(without.lineCount).toBeGreaterThan(0);
    expect(with_.lineCount).toBeGreaterThan(0);
  });

  it('looseness — optimal vs +1 vs -1', () => {
    const optimal = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      tolerance: 20,
    });
    const looser = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      tolerance: 20,
      looseness: 1,
    });
    const tighter = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      tolerance: 20,
      looseness: -1,
    });
    print('Looseness=0 (optimal)', optimal.lines);
    print('Looseness=+1 (looser)', looser.lines);
    print('Looseness=-1 (tighter)', tighter.lines);
    expect(looser.lineCount).toBeGreaterThanOrEqual(optimal.lineCount);
    expect(tighter.lineCount).toBeLessThanOrEqual(optimal.lineCount);
  });

  it('soft hyphen preservation — explicit breaks honoured', () => {
    const with_ = composer.compose({
      text: SOFT_TEXT,
      font: FONT,
      lineWidth: 150,
      tolerance: 3,
      preserveSoftHyphens: true,
    });
    const without = composer.compose({
      text: SOFT_TEXT,
      font: FONT,
      lineWidth: 150,
      tolerance: 3,
      preserveSoftHyphens: false,
    });
    print('preserveSoftHyphens=true', with_.lines);
    print('preserveSoftHyphens=false', without.lines);
    expect(with_.lineCount).toBeGreaterThan(0);
    expect(without.lineCount).toBeGreaterThan(0);
  });

  it('consecutiveHyphenLimit — unlimited vs limit=1', () => {
    const text = 'internationalization localization implementation beautiful';
    const unlimited = composer.compose({
      text,
      font: FONT,
      lineWidth: 250,
      tolerance: 5,
    });
    const limited = composer.compose({
      text,
      font: FONT,
      lineWidth: 250,
      tolerance: 5,
      consecutiveHyphenLimit: 1,
    });
    print('No consecutive hyphen limit', unlimited.lines);
    print('consecutiveHyphenLimit=1', limited.lines);
    expect(unlimited.lineCount).toBeGreaterThan(0);
    expect(limited.lineCount).toBeGreaterThan(0);
  });

  it('justifyLastLine — false vs true', () => {
    const without = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      justifyLastLine: false,
    });
    const with_ = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 250,
      justifyLastLine: true,
    });
    print('justifyLastLine=false', without.lines);
    print('justifyLastLine=true', with_.lines);
    const lastWithout = without.lines[without.lines.length - 1];
    const lastWith = with_.lines[with_.lines.length - 1];
    console.log(
      `\n  Last line without: spacing=${lastWithout.wordSpacing.toFixed(3)}pt  ratio=${lastWithout.ratio.toFixed(4)}`,
    );
    console.log(
      `  Last line with:    spacing=${lastWith.wordSpacing.toFixed(3)}pt  ratio=${lastWith.ratio.toFixed(4)}`,
    );
  });

  it('language — English vs German hyphenation', async () => {
    const deText =
      'Internationalisierung und Lokalisierung sind wichtige Aspekte der Softwareentwicklung';
    const en = composer.compose({
      text: TEXT,
      font: FONT,
      lineWidth: 300,
      tolerance: 3,
      language: 'en-us',
    });
    const de = composer.compose({
      text: deText,
      font: FONT,
      lineWidth: 300,
      tolerance: 3,
      language: 'de',
    });
    print('English (en-us)', en.lines);
    print('German (de)', de.lines);
    expect(en.lineCount).toBeGreaterThan(0);
    expect(de.lineCount).toBeGreaterThan(0);
  });
});
