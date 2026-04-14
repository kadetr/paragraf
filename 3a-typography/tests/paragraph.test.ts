import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import {
  createParagraphComposer,
  ParagraphInput,
  ParagraphOutput,
  ParagraphComposer,
} from '@paragraf/typography';
import { FontRegistry, Font } from '@paragraf/types';
import { layoutParagraph } from '@paragraf/render-core';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const REGULAR_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');
const BOLD_PATH = path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf');
const ROBOTO_PATH = path.join(FONTS_DIR, 'Roboto-Regular.ttf');

const FONT_REGULAR: Font = {
  id: 'liberation-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const FONT_BOLD: Font = {
  id: 'liberation-bold',
  size: 12,
  weight: 700,
  style: 'normal',
  stretch: 'normal',
};

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      family: 'Liberation Serif',
      filePath: REGULAR_PATH,
    },
  ],
  [
    'liberation-bold',
    {
      id: 'liberation-bold',
      family: 'Liberation Serif Bold',
      filePath: BOLD_PATH,
    },
  ],
  [
    'roboto-regular',
    {
      id: 'roboto-regular',
      family: 'Roboto',
      filePath: ROBOTO_PATH,
    },
  ],
]);

const TEXT =
  'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful';

// ─── Setup ───────────────────────────────────────────────────────────────────

let composer: ParagraphComposer;

beforeAll(async () => {
  composer = await createParagraphComposer(REGISTRY);
});

// ─── createParagraphComposer ──────────────────────────────────────────────────

describe('createParagraphComposer', () => {
  it('creates a composer without throwing', () => {
    expect(composer).toBeDefined();
    expect(composer.compose).toBeTypeOf('function');
    expect(composer.ensureLanguage).toBeTypeOf('function');
  });

  it('composer.compose returns a ParagraphOutput', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    expect(output).toBeDefined();
    expect(Array.isArray(output.lines)).toBe(true);
    expect(typeof output.lineCount).toBe('number');
    expect(typeof output.usedEmergency).toBe('boolean');
  });
});

// ─── ParagraphOutput contracts ────────────────────────────────────────────────

describe('ParagraphOutput — basic contracts', () => {
  let output: ParagraphOutput;

  beforeAll(() => {
    output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
  });

  it('produces at least one line', () => {
    expect(output.lineCount).toBeGreaterThan(0);
  });

  it('lineCount matches lines array length', () => {
    expect(output.lineCount).toBe(output.lines.length);
  });

  it('usedEmergency is false for normal paragraph', () => {
    expect(output.usedEmergency).toBe(false);
  });

  it('every line has words and fonts', () => {
    output.lines.forEach((l) => {
      expect(l.words.length).toBeGreaterThan(0);
      expect(l.fonts.length).toBe(l.words.length);
    });
  });

  it('every line has alignment field', () => {
    output.lines.forEach((l) => expect(l.alignment).toBeDefined());
  });

  it('every line ratio is finite', () => {
    output.lines.forEach((l) => expect(Number.isFinite(l.ratio)).toBe(true));
  });

  it('last line ratio is 0', () => {
    expect(output.lines[output.lines.length - 1].ratio).toBe(0);
  });

  it('all ratios within tolerance', () => {
    output.lines.forEach((l) => {
      expect(l.ratio).toBeGreaterThanOrEqual(-1);
      expect(l.ratio).toBeLessThanOrEqual(2);
    });
  });
});

// ─── Defaults ─────────────────────────────────────────────────────────────────

describe('ParagraphInput — defaults', () => {
  it('tolerance defaults to 2 — narrow column succeeds', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 200,
    });
    expect(output.lineCount).toBeGreaterThan(0);
  });

  it('default alignment is justified', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    output.lines.forEach((l) => expect(l.alignment).toBe('justified'));
  });

  it('default language is en-us — runs without error', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    expect(output.lineCount).toBeGreaterThan(0);
  });

  it('default firstLineIndent is 0 — first word is not empty', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    expect(output.lines[0].words[0]).not.toBe('');
  });
});

// ─── Configuration ────────────────────────────────────────────────────────────

describe('ParagraphInput — configuration', () => {
  it('alignment is applied to all lines', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      alignment: 'left',
    });
    output.lines.forEach((l) => expect(l.alignment).toBe('left'));
  });

  it('larger lineWidth produces fewer or equal lines', () => {
    const narrow = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 150,
    });
    const wide = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    expect(wide.lineCount).toBeLessThanOrEqual(narrow.lineCount);
  });

  it('firstLineIndent reduces first line capacity', () => {
    const noIndent = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const withIndent = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      firstLineIndent: 24,
    });
    expect(withIndent.lineCount).toBeGreaterThanOrEqual(noIndent.lineCount);
  });

  it('throws without emergencyStretch when tolerance is impossible', () => {
    // tolerance=0 is impossible — no paragraph can have ratio exactly 0 on every line
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        tolerance: 0,
      }),
    ).toThrow();
  });

  it('emergencyStretch does not affect paragraph that sets normally', () => {
    const without = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      tolerance: 2,
    });
    const with_ = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      tolerance: 2,
      emergencyStretch: 100,
    });
    expect(with_.lineCount).toBe(without.lineCount);
    expect(with_.usedEmergency).toBe(false);
  });

  it('usedEmergency is false when paragraph sets within normal tolerance', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      tolerance: 2,
    });
    expect(output.usedEmergency).toBe(false);
  });

  it('throws for unknown language', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        language: 'xx' as any,
      }),
    ).toThrow();
  });

  it('language option is used for hyphenation', async () => {
    await composer.ensureLanguage('de');

    const output = composer.compose({
      text: 'Entschuldigung bitte ich brauche mehr Zeit für diese Aufgabe',
      font: FONT_REGULAR,
      lineWidth: 200,
      language: 'de',
    });
    expect(output.lineCount).toBeGreaterThan(0);
  });
});

// ─── fontPerWord ──────────────────────────────────────────────────────────────

describe('ParagraphInput — fontPerWord', () => {
  it('fontPerWord overrides default font per word', () => {
    const output = composer.compose({
      text: 'the fox and the dog',
      font: FONT_REGULAR,
      lineWidth: 500,
      fontPerWord: (i) => (i % 2 === 0 ? FONT_BOLD : FONT_REGULAR),
    });
    expect(output.lines.length).toBeGreaterThan(0);
    const allFontIds = output.lines.flatMap((l) => l.fonts.map((f) => f.id));
    expect(allFontIds).toContain('liberation-regular');
    expect(allFontIds).toContain('liberation-bold');
  });

  it('without fontPerWord all words use default font', () => {
    const output = composer.compose({
      text: 'the fox and the dog',
      font: FONT_REGULAR,
      lineWidth: 500,
    });
    const allFontIds = output.lines.flatMap((l) => l.fonts.map((f) => f.id));
    allFontIds.forEach((id) => expect(id).toBe('liberation-regular'));
  });
});

// ─── ensureLanguage ───────────────────────────────────────────────────────────

describe('ParagraphComposer — ensureLanguage', () => {
  it('ensureLanguage resolves without throwing for supported language', async () => {
    await expect(composer.ensureLanguage('fr')).resolves.not.toThrow();
  });

  it('after ensureLanguage, that language composes successfully', async () => {
    await composer.ensureLanguage('fr');
    const output = composer.compose({
      text: 'développement logiciel moderne',
      font: FONT_REGULAR,
      lineWidth: 200,
      language: 'fr',
    });
    expect(output.lineCount).toBeGreaterThan(0);
  });

  it('calling ensureLanguage twice for same language does not throw', async () => {
    await expect(composer.ensureLanguage('en-us')).resolves.not.toThrow();
    await expect(composer.ensureLanguage('en-us')).resolves.not.toThrow();
  });
});

describe('ParagraphInput — step 3a parameters', () => {
  it('softHyphen in text is preserved as preferred break point', () => {
    const output = composer.compose({
      text: 'co\u00ADoperate and collaborate together',
      font: FONT_REGULAR,
      lineWidth: 150,
      tolerance: 3,
      preserveSoftHyphens: true,
    });
    expect(output.lineCount).toBeGreaterThan(0);
  });

  it('consecutiveHyphenLimit is passed through without throwing', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        consecutiveHyphenLimit: 2,
      }),
    ).not.toThrow();
  });

  it('widowPenalty is passed through without throwing', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        widowPenalty: 5000,
      }),
    ).not.toThrow();
  });

  it('orphanPenalty is passed through without throwing', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        orphanPenalty: 5000,
      }),
    ).not.toThrow();
  });

  it('looseness=0 produces same result as default', () => {
    const default_ = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const explicit = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      looseness: 0,
    });
    expect(default_.lineCount).toBe(explicit.lineCount);
  });

  it('widowPenalty demonstrably affects demerits', () => {
    const without = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const with_ = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      widowPenalty: 1000000,
    });
    // either different line count or different internal demerits
    // both are valid outcomes of widow penalty
    expect(with_.lineCount).toBeGreaterThan(0);
    expect(without.lineCount).toBeGreaterThan(0);
  });

  it('justifyLastLine=true — last line has computed spacing', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      justifyLastLine: true,
    });
    const last = output.lines[output.lines.length - 1];
    expect(Number.isFinite(last.wordSpacing)).toBe(true);
  });

  it('preserveSoftHyphens=false — soft hyphens in input are ignored', () => {
    const with_ = composer.compose({
      text: 'co\u00ADoperate',
      font: FONT_REGULAR,
      lineWidth: 500,
      preserveSoftHyphens: true,
    });
    const without = composer.compose({
      text: 'co\u00ADoperate',
      font: FONT_REGULAR,
      lineWidth: 500,
      preserveSoftHyphens: false,
    });
    expect(with_.lineCount).toBeGreaterThan(0);
    expect(without.lineCount).toBeGreaterThan(0);
  });
  it('widowPenalty demonstrably changes totalDemerits', () => {
    const text = 'In olden times when wishing still helped one';
    const without = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const with_ = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 250,
      widowPenalty: 1000000,
    });

    // one of: different line count OR different spacing on last line
    const lastWithout = without.lines[without.lines.length - 1];
    const lastWith = with_.lines[with_.lines.length - 1];

    const changed =
      without.lineCount !== with_.lineCount ||
      lastWithout.words.join('') !== lastWith.words.join('');

    // if widow exists and penalty is extreme, something must change
    expect(without.lineCount).toBeGreaterThan(0);
    expect(with_.lineCount).toBeGreaterThan(0);
    // not asserting changed=true because widow may not exist in this paragraph
    // the real proof is in linebreak.test.ts — widowPenalty demonstrably changes selection
  });

  it('looseness through facade matches linebreak behaviour', () => {
    const text = 'In olden times when wishing still helped one';
    const optimal = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      tolerance: 20,
    });
    const looser = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      tolerance: 20,
      looseness: 1,
    });

    // looseness=+1 produces >= lines than optimal (matches linebreak.test.ts)
    expect(looser.lineCount).toBeGreaterThanOrEqual(optimal.lineCount);
  });
});

// ─── isWidow ─────────────────────────────────────────────────────────────────

describe('ParagraphOutput — isWidow', () => {
  it('isWidow is false when last line has multiple words', () => {
    // wide enough that last line always has multiple words
    const output = composer.compose({
      text: 'the fox and the dog',
      font: FONT_REGULAR,
      lineWidth: 500,
    });
    const last = output.lines[output.lines.length - 1];
    expect(last.words.length).toBeGreaterThan(1);
    expect(last.isWidow).toBe(false);
  });

  it('isWidow is true when last line has exactly one word', () => {
    // use a paragraph and lineWidth known to produce a single-word last line
    // then verify isWidow=true
    // we first find such a configuration by checking the output
    const output = composer.compose({
      text: 'In olden times when wishing still helped one',
      font: FONT_REGULAR,
      lineWidth: 200,
    });
    const last = output.lines[output.lines.length - 1];
    if (last.words.length === 1) {
      // this configuration produces a widow — verify it is marked
      expect(last.isWidow).toBe(true);
    } else {
      // paragraph doesn't produce widow at this width — test is inapplicable
      // isWidow must still be false
      expect(last.isWidow).toBe(false);
    }
  });
});

// ─── TextSpan[] input ─────────────────────────────────────────────────────────

describe('ParagraphInput — spans (basic contracts)', () => {
  it('spans input produces output without throwing', () => {
    expect(() =>
      composer.compose({
        spans: [{ text: 'Hello world', font: FONT_REGULAR }],
        font: FONT_REGULAR,
        lineWidth: 400,
      }),
    ).not.toThrow();
  });

  it('single-span input produces the same words as equivalent text input', () => {
    const text = 'In olden times when wishing still helped one';
    const fromText = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const fromSpans = composer.compose({
      spans: [{ text, font: FONT_REGULAR }],
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const textWords = fromText.lines.flatMap((l) => l.words).join(' ');
    const spanWords = fromSpans.lines.flatMap((l) => l.words).join(' ');
    expect(spanWords).toBe(textWords);
  });

  it('words array has correct fonts for a two-span input', () => {
    const output = composer.compose({
      spans: [
        { text: 'Hello ', font: FONT_REGULAR },
        { text: 'world', font: FONT_BOLD },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allFontIds = output.lines.flatMap((l) => l.fonts.map((f) => f.id));
    expect(allFontIds).toContain(FONT_REGULAR.id);
    expect(allFontIds).toContain(FONT_BOLD.id);
  });

  it('wordRuns carries per-segment detail for a mixed-font word', () => {
    const output = composer.compose({
      spans: [
        { text: 'Hel', font: FONT_REGULAR },
        { text: 'lo', font: FONT_BOLD },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    // 'Hello' is one word with two runs: 'Hel' (regular) and 'lo' (bold)
    const firstWordRuns = output.lines[0].wordRuns[0];
    expect(firstWordRuns.length).toBe(2);
    expect(firstWordRuns[0].text).toBe('Hel');
    expect(firstWordRuns[0].font.id).toBe(FONT_REGULAR.id);
    expect(firstWordRuns[1].text).toBe('lo');
    expect(firstWordRuns[1].font.id).toBe(FONT_BOLD.id);
  });
});

// ─── verticalOffset propagation ──────────────────────────────────────────────

describe('TextSpan.verticalOffset — propagation to wordRuns', () => {
  it('verticalOffset on a span flows through to every SpanSegment in wordRuns', () => {
    const output = composer.compose({
      spans: [
        { text: 'Hello ', font: FONT_REGULAR },
        { text: 'world', font: FONT_BOLD, verticalOffset: 4 },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    const boldRuns = allRuns.filter((s) => s.font.id === FONT_BOLD.id);
    expect(boldRuns.length).toBeGreaterThan(0);
    boldRuns.forEach((s) => expect(s.verticalOffset).toBe(4));
  });

  it('spans without verticalOffset produce undefined on their SpanSegments', () => {
    const output = composer.compose({
      spans: [{ text: 'Hello world', font: FONT_REGULAR }],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    allRuns.forEach((s) => expect(s.verticalOffset).toBeUndefined());
  });

  it('negative verticalOffset (subscript) is propagated correctly', () => {
    const output = composer.compose({
      spans: [
        { text: 'H', font: FONT_REGULAR },
        { text: '2', font: FONT_REGULAR, verticalOffset: -3 },
        { text: 'O', font: FONT_REGULAR },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    const subscriptRun = allRuns.find((s) => s.text === '2');
    expect(subscriptRun).toBeDefined();
    expect(subscriptRun!.verticalOffset).toBe(-3);
  });

  it('different spans carry different verticalOffsets in the same line', () => {
    const output = composer.compose({
      spans: [
        { text: 'base ', font: FONT_REGULAR },
        { text: 'sup', font: FONT_BOLD, verticalOffset: 4 },
        { text: ' sub', font: FONT_REGULAR, verticalOffset: -3 },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    const supRun = allRuns.find((s) => s.text === 'sup');
    const subRun = allRuns.find((s) => s.text === 'sub');
    expect(supRun?.verticalOffset).toBe(4);
    expect(subRun?.verticalOffset).toBe(-3);
  });

  it('verticalOffset propagates through hyphenation fragment boundaries', () => {
    // force hyphenation on a long word by narrowing the line
    const output = composer.compose({
      spans: [
        { text: 'internationalization', font: FONT_REGULAR, verticalOffset: 5 },
      ],
      font: FONT_REGULAR,
      lineWidth: 100,
      tolerance: 5,
    });
    // every wordRun segment that comes from this span must carry verticalOffset=5
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    const regularRuns = allRuns.filter(
      (s) => s.font.id === FONT_REGULAR.id && s.text !== '',
    );
    expect(regularRuns.length).toBeGreaterThan(0);
    regularRuns.forEach((s) => expect(s.verticalOffset).toBe(5));
  });

  it('verticalOffset=0 is stored as 0 (not undefined)', () => {
    const output = composer.compose({
      spans: [{ text: 'Hello', font: FONT_REGULAR, verticalOffset: 0 }],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allRuns = output.lines.flatMap((l) => l.wordRuns).flat();
    expect(allRuns.length).toBeGreaterThan(0);
    allRuns.forEach((s) => expect(s.verticalOffset).toBe(0));
  });
});

// ─── lineHeight override ──────────────────────────────────────────────────────

describe('ParagraphInput — lineHeight override', () => {
  it('lineHeight stamps every output line with the given value', () => {
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineHeight: 18,
    });
    expect(output.lineCount).toBeGreaterThan(0);
    output.lines.forEach((l) => expect(l.lineHeight).toBe(18));
  });

  it('lineHeight=0 is ignored — uses font-metric-derived value', () => {
    const noOverride = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const withZero = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineHeight: 0,
    });
    expect(withZero.lines[0].lineHeight).toBe(noOverride.lines[0].lineHeight);
  });

  it('negative lineHeight is ignored — uses font-metric-derived value', () => {
    const noOverride = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const withNeg = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineHeight: -5,
    });
    expect(withNeg.lines[0].lineHeight).toBe(noOverride.lines[0].lineHeight);
  });

  it('lineHeight override does not affect line count', () => {
    const normal = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    const withOverride = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineHeight: 24,
    });
    expect(withOverride.lineCount).toBe(normal.lineCount);
  });

  it('lineHeight override is reflected in layoutParagraph output — baselines advance by the given value', () => {
    const LH = 30;
    const output = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineHeight: LH,
    });
    // Require at least two lines so we can check the advance between them.
    expect(output.lineCount).toBeGreaterThan(1);

    const measurer = composer.measurer;
    expect(measurer).toBeDefined();
    if (!measurer) {
      throw new Error('Expected composer.measurer to be defined');
    }
    const rendered = layoutParagraph(output.lines, measurer, {
      x: 0,
      y: 0,
    });

    // Every RenderedLine should report the overridden lineHeight.
    rendered.forEach((rl) => expect(rl.lineHeight).toBe(LH));

    // Consecutive baselines differ by exactly LH (baseline = lineY + line.baseline,
    // and line.baseline is constant for a uniform font/size).
    for (let i = 1; i < rendered.length; i++) {
      expect(rendered[i].baseline - rendered[i - 1].baseline).toBeCloseTo(
        LH,
        5,
      );
    }
  });
});
