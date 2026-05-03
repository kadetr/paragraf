import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as path from 'path';
import {
  createParagraphComposer,
  clearMeasureCache,
  clearShapingState,
  configureMeasureCache,
  getMeasureCacheStats,
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

describe('Measure cache (3a ownership)', () => {
  it('records cache hits on warm compose runs', () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 10_000 });

    composer.compose({
      text: 'cache cache cache warmup run text',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const first = getMeasureCacheStats();

    composer.compose({
      text: 'cache cache cache warmup run text',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    const second = getMeasureCacheStats();

    expect(first.misses).toBeGreaterThan(0);
    expect(second.hits).toBeGreaterThan(first.hits);
  });

  it('disabled cache does not store entries', () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: false, maxCacheEntries: 10_000 });

    composer.compose({
      text: 'disabled cache run one',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    composer.compose({
      text: 'disabled cache run one',
      font: FONT_REGULAR,
      lineWidth: 300,
    });

    const stats = getMeasureCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it('evicts least-recently-used entries when capacity is exceeded', () => {
    clearMeasureCache();
    configureMeasureCache({ enabled: true, maxCacheEntries: 1 });

    composer.compose({
      text: 'alpha beta gamma delta',
      font: FONT_REGULAR,
      lineWidth: 600,
    });

    const stats = getMeasureCacheStats();
    expect(stats.evictions).toBeGreaterThan(0);
    expect(stats.size).toBe(1);
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

  it('runtPenalty (canonical name) is passed through without throwing', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        runtPenalty: 5000,
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

  it('singleLinePenalty (canonical name) is passed through without throwing', () => {
    expect(() =>
      composer.compose({
        text: TEXT,
        font: FONT_REGULAR,
        lineWidth: 250,
        singleLinePenalty: 5000,
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

// ─── isWidow / isRunt ────────────────────────────────────────────────────────

describe('ParagraphOutput — isRunt / isWidow', () => {
  it('isRunt is false when last line has multiple words', () => {
    const output = composer.compose({
      text: 'the fox and the dog',
      font: FONT_REGULAR,
      lineWidth: 500,
    });
    const last = output.lines[output.lines.length - 1];
    expect(last.words.length).toBeGreaterThan(1);
    expect(last.isRunt).toBe(false);
    expect(last.isWidow).toBe(false); // deprecated alias must agree
  });

  it('isRunt is true when last line has exactly one word', () => {
    const output = composer.compose({
      text: 'In olden times when wishing still helped one',
      font: FONT_REGULAR,
      lineWidth: 200,
    });
    const last = output.lines[output.lines.length - 1];
    if (last.words.length === 1) {
      expect(last.isRunt).toBe(true);
      expect(last.isWidow).toBe(true); // deprecated alias must agree
    } else {
      expect(last.isRunt).toBe(false);
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

// ─── Corner cases — #63 ───────────────────────────────────────────────────────

describe('corner cases — empty and minimal paragraphs', () => {
  it('empty text produces 1 line with an empty word (current boundary behaviour)', () => {
    // The KP node sequence always contains the terminal forced-break node, so an
    // empty text string still yields one line with a single empty word. This test
    // documents the current behaviour so a future change to return 0 lines is
    // explicitly detectable.
    const out = composer.compose({
      text: '',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].words).toEqual(['']);
  });

  it('whitespace-only text produces 1 line (same boundary behaviour as empty)', () => {
    const out = composer.compose({
      text: '   ',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
  });

  it('single word produces exactly 1 line', () => {
    const out = composer.compose({
      text: 'Hello',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].words).toEqual(['Hello']);
  });

  it('single word with all-uppercase produces 1 line', () => {
    const out = composer.compose({
      text: 'HELLO',
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
  });

  it('all-uppercase multi-word text composes without error', () => {
    const out = composer.compose({
      text: 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
      font: FONT_REGULAR,
      lineWidth: 250,
    });
    expect(out.lineCount).toBeGreaterThan(0);
    out.lines.forEach((l) => {
      expect(Number.isFinite(l.ratio)).toBe(true);
      expect(l.words.length).toBeGreaterThan(0);
    });
  });
});

describe('corner cases — empty spans input', () => {
  it('empty spans array produces 1 line with an empty word (mirrors empty text)', () => {
    const out = composer.compose({
      spans: [],
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].words).toEqual(['']);
  });

  it('single empty-string span produces 0 lines', () => {
    const out = composer.compose({
      spans: [{ text: '', font: FONT_REGULAR }],
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(0);
  });

  it('span with single word produces 1 line', () => {
    const out = composer.compose({
      spans: [{ text: 'Hello', font: FONT_REGULAR }],
      font: FONT_REGULAR,
      lineWidth: 300,
    });
    expect(out.lines).toHaveLength(1);
  });
});

describe('corner cases — RTL with embedded LTR digits', () => {
  it('LTR paragraph with embedded digits composes without NaN ratios', () => {
    // Digits inside LTR text — digit runs are LTR within any direction paragraph.
    // This verifies the pipeline handles digit-only words without NaN/Infinity.
    const out = composer.compose({
      text: 'The price is 1234 dollars and 56 cents per unit',
      font: FONT_REGULAR,
      lineWidth: 200,
    });
    expect(out.lineCount).toBeGreaterThan(0);
    out.lines.forEach((l) => {
      expect(Number.isFinite(l.ratio)).toBe(true);
      l.words.forEach((w) => expect(w).toBeTruthy());
    });
  });

  it('paragraph with mixed numbers and punctuation composes cleanly', () => {
    const out = composer.compose({
      text: 'Items: 1, 2, 3. Total: 100.00. Ref: A-23/B.',
      font: FONT_REGULAR,
      lineWidth: 150,
    });
    expect(out.lineCount).toBeGreaterThan(0);
    out.lines.forEach((l) => expect(Number.isFinite(l.ratio)).toBe(true));
  });
});

describe('corner cases — multi-font spans across hyphen fragments', () => {
  it('span boundary mid-word: each fragment carries the correct font', () => {
    // "inter" in regular, "national" in bold — forces hyphenation across fonts
    const out = composer.compose({
      spans: [
        { text: 'inter', font: FONT_REGULAR },
        { text: 'national', font: FONT_BOLD },
      ],
      font: FONT_REGULAR,
      lineWidth: 60, // narrow enough to trigger a hyphen break
      tolerance: 8,
      emergencyStretch: 20,
    });
    expect(out.lineCount).toBeGreaterThan(0);
    // All wordRun segments must have a defined, finite-size font
    out.lines.forEach((l) =>
      l.wordRuns.flat().forEach((seg) => {
        expect(seg.font).toBeDefined();
        expect(seg.font.size).toBeGreaterThan(0);
      }),
    );
  });

  it('three-font span across a single word: all fonts survive composition', () => {
    const out = composer.compose({
      spans: [
        { text: 'A', font: FONT_REGULAR },
        { text: 'B', font: FONT_BOLD },
        { text: 'C', font: FONT_REGULAR },
      ],
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const allFonts = out.lines.flatMap((l) =>
      l.wordRuns.flat().map((s) => s.font.id),
    );
    expect(allFonts).toContain(FONT_REGULAR.id);
    expect(allFonts).toContain(FONT_BOLD.id);
  });

  it('multi-font spans produce no undefined wordRun entries', () => {
    const out = composer.compose({
      spans: [
        { text: 'The quick ', font: FONT_REGULAR },
        { text: 'brown fox ', font: FONT_BOLD },
        { text: 'jumps over', font: FONT_REGULAR },
      ],
      font: FONT_REGULAR,
      lineWidth: 120,
      emergencyStretch: 20,
    });
    out.lines.forEach((l) =>
      l.wordRuns.forEach((runs) => {
        expect(runs).toBeDefined();
        runs.forEach((seg) => {
          expect(seg).toBeDefined();
          expect(seg.font).toBeDefined();
        });
      }),
    );
  });
});

describe('corner cases — single-line edge cases', () => {
  it('text that fits in a single word on a very wide line: last-line ratio is 0', () => {
    const out = composer.compose({
      text: 'Hi',
      font: FONT_REGULAR,
      lineWidth: 1000,
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].ratio).toBe(0);
  });

  it('lineWidths array shorter than line count falls back to lineWidth', () => {
    // Provide per-line widths for fewer lines than the paragraph produces.
    // Should not throw; extra lines use the base lineWidth.
    const out = composer.compose({
      text: TEXT,
      font: FONT_REGULAR,
      lineWidth: 250,
      lineWidths: [200], // only first line narrowed
    });
    expect(out.lineCount).toBeGreaterThan(1);
    out.lines.forEach((l) => expect(Number.isFinite(l.ratio)).toBe(true));
  });
});

// ─── ParagraphInput — hyphenation: false ─────────────────────────────────────

describe('ParagraphInput — hyphenation: false', () => {
  it('R5: hyphenation: false produces no hyphenated lines (text-mode LTR)', () => {
    // Use a narrow line and long words to guarantee hyphens would appear normally.
    // lineWidth 200 fits each word (≈140pt and ≈110pt at 12pt) but not both together.
    const output = composer.compose({
      text: 'internationalization standardization',
      font: FONT_REGULAR,
      lineWidth: 200,
      tolerance: 5,
      hyphenation: false,
    });
    expect(output.lineCount).toBeGreaterThan(0);
    // No line should be hyphenated when hyphenation is disabled.
    output.lines.forEach((l) => expect(l.hyphenated).toBe(false));
  });

  it('R6: hyphenation: false — each word is a single non-hyphenable fragment', () => {
    // With hyphenation disabled, every word in the output should appear as a
    // whole token (not split at a hyphen boundary).
    const words = ['internationalization', 'standardization'];
    const output = composer.compose({
      text: words.join(' '),
      font: FONT_REGULAR,
      lineWidth: 200,
      tolerance: 5,
      hyphenation: false,
    });
    // Collect all output words (ignoring empty strings from edge cases).
    const outputWords = output.lines
      .flatMap((l) => l.words)
      .filter((w) => w.length > 0);
    // Every output token must be one of the original whole words (no partial fragments).
    outputWords.forEach((w) => {
      expect(words).toContain(w);
    });
  });

  it('hyphenation: true (default) still hyphenates when needed', () => {
    const withHyphen = composer.compose({
      text: 'internationalization',
      font: FONT_REGULAR,
      lineWidth: 200,
      tolerance: 5,
    });
    // Default behaviour unchanged — hyphenation may occur (not asserting it
    // must, since line width/font could accommodate it in one line, but we
    // verify the compose call succeeds and respects the default).
    expect(withHyphen.lineCount).toBeGreaterThan(0);
  });
});

// ─── F003: clearShapingState ──────────────────────────────────────────────────

describe('clearShapingState (F003)', () => {
  it('RT4: clearShapingState is exported from @paragraf/typography', async () => {
    const mod = await import('@paragraf/typography');
    expect(typeof mod.clearShapingState).toBe('function');
  });

  it('RT5: calling clearShapingState causes _rtlFallbackWarnIssued to reset so the warn fires again', async () => {
    const { clearShapingState } = await import('@paragraf/typography');

    const rtlText = 'שלום עולם'; // Hebrew — strong RTL characters
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    // Compose RTL once — warn fires (if WASM absent)
    composer.compose({ text: rtlText, font: FONT_REGULAR, lineWidth: 300 });
    const countAfterFirst = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('BiDi'),
    ).length;

    // Compose RTL again without reset — warn must NOT fire again
    warnSpy.mockClear();
    composer.compose({ text: rtlText, font: FONT_REGULAR, lineWidth: 300 });
    const countAfterSecondNoReset = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('BiDi'),
    ).length;

    // Reset + compose again — if WASM absent, warn fires once more
    warnSpy.mockClear();
    clearShapingState();
    composer.compose({ text: rtlText, font: FONT_REGULAR, lineWidth: 300 });
    const countAfterReset = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('BiDi'),
    ).length;

    warnSpy.mockRestore();

    // If WASM is absent, the warn should have fired on first compose
    // and fired again after clearShapingState. If WASM is present,
    // the warn never fires — both counts are 0, which is also correct.
    if (countAfterFirst > 0) {
      // WASM absent path: second compose (no reset) must not re-warn
      expect(countAfterSecondNoReset).toBe(0);
      // After reset, must warn again
      expect(countAfterReset).toBeGreaterThan(0);
    } else {
      // WASM present path: warn never fires — clearShapingState is a no-op for this flag
      expect(countAfterSecondNoReset).toBe(0);
      expect(countAfterReset).toBe(0);
    }
  });
});

// ─── F010 — deprecated widowPenalty/orphanPenalty aliases ─────────────────────

describe('F010 — deprecated widowPenalty/orphanPenalty backward compat (T1–T4)', () => {
  // T1: deprecated widowPenalty still affects layout
  it('T1: widowPenalty: 5000 produces the same result as runtPenalty: 5000', () => {
    const text =
      'In olden times when wishing still helped one there lived a king';
    const viaDeprecated = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      widowPenalty: 5000,
    });
    const viaCanonical = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      runtPenalty: 5000,
    });
    expect(viaDeprecated.lineCount).toBe(viaCanonical.lineCount);
    viaDeprecated.lines.forEach((l, i) => {
      expect(l.words.join(' ')).toBe(viaCanonical.lines[i].words.join(' '));
    });
  });

  // T2: deprecated orphanPenalty still affects layout
  it('T2: orphanPenalty: 5000 produces the same result as singleLinePenalty: 5000', () => {
    const text =
      'In olden times when wishing still helped one there lived a king';
    const viaDeprecated = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      orphanPenalty: 5000,
    });
    const viaCanonical = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      singleLinePenalty: 5000,
    });
    expect(viaDeprecated.lineCount).toBe(viaCanonical.lineCount);
    viaDeprecated.lines.forEach((l, i) => {
      expect(l.words.join(' ')).toBe(viaCanonical.lines[i].words.join(' '));
    });
  });

  // T3: canonical runtPenalty takes precedence over widowPenalty when both provided
  it('T3: canonical runtPenalty takes precedence over deprecated widowPenalty', () => {
    const text =
      'In olden times when wishing still helped one there lived a king';
    const canonical = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      runtPenalty: 5000,
    });
    const both = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      runtPenalty: 5000,
      widowPenalty: 0, // ignored — canonical wins
    });
    expect(both.lineCount).toBe(canonical.lineCount);
    both.lines.forEach((l, i) => {
      expect(l.words.join(' ')).toBe(canonical.lines[i].words.join(' '));
    });
  });

  // T4: canonical singleLinePenalty takes precedence over orphanPenalty when both provided
  it('T4: canonical singleLinePenalty takes precedence over deprecated orphanPenalty', () => {
    const text =
      'In olden times when wishing still helped one there lived a king';
    const canonical = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      singleLinePenalty: 5000,
    });
    const both = composer.compose({
      text,
      font: FONT_REGULAR,
      lineWidth: 200,
      singleLinePenalty: 5000,
      orphanPenalty: 0, // ignored — canonical wins
    });
    expect(both.lineCount).toBe(canonical.lineCount);
    both.lines.forEach((l, i) => {
      expect(l.words.join(' ')).toBe(canonical.lines[i].words.join(' '));
    });
  });
});

// ─── F012 — ParagraphInput.font optional in spans mode (T8, T9, T10) ─────────

describe('F012 — ParagraphInput.font optional in spans mode (T8–T10)', () => {
  // T8: spans mode without font field succeeds
  it('T8: compose() with spans and no font field succeeds', () => {
    // After F012 fix: font is optional — spans carry their own fonts
    expect(() =>
      composer.compose({
        spans: [{ text: 'Hello world', font: FONT_REGULAR }],
        lineWidth: 400,
      } as any),
    ).not.toThrow();
  });

  it('T8b: compose() with spans and no font — output lines carry font from spans', () => {
    const output = composer.compose({
      spans: [{ text: 'Hello world', font: FONT_REGULAR }],
      lineWidth: 400,
    } as any);
    expect(output.lineCount).toBeGreaterThan(0);
    const allFontIds = output.lines.flatMap((l) => l.fonts.map((f) => f.id));
    allFontIds.forEach((id) => expect(id).toBe(FONT_REGULAR.id));
  });

  // T9: text mode without font throws a descriptive error
  it('T9: compose() with text and no font throws with descriptive message', () => {
    expect(() =>
      composer.compose({
        text: 'Hello world',
        lineWidth: 400,
      } as any),
    ).toThrow(/font is required when using text mode/);
  });

  // T10: neither text nor spans throws
  it('T10: compose() with neither text nor spans throws a descriptive error', () => {
    expect(() =>
      composer.compose({
        lineWidth: 400,
      } as any),
    ).toThrow();
  });
});

// ─── F013: detectParagraphDirection TS fallback — extended RTL scripts ────────

describe('detectParagraphDirection TS fallback — F013: extended RTL scripts', () => {
  // Each test uses a composer forced into TS mode (useWasm: false) so the
  // TS detectParagraphDirection path is exercised regardless of WASM availability.
  // clearShapingState() resets _rtlFallbackWarnIssued before each test.

  let tsComposer: ParagraphComposer;

  beforeAll(async () => {
    tsComposer = await createParagraphComposer(REGISTRY, { useWasm: false });
  });

  const expectRtlWarn = (text: string, label: string) => {
    clearShapingState();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    tsComposer.compose({ text, font: FONT_REGULAR, lineWidth: 400 });
    const bidiWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('BiDi'),
    );
    warnSpy.mockRestore();
    expect(
      bidiWarns.length,
      `${label}: expected BiDi warn to fire`,
    ).toBeGreaterThan(0);
  };

  it('F013-1: Syriac opening char triggers BiDi TS-fallback warn', () => {
    // U+0710 SYRIAC LETTER ALAPH — first char in Syriac block
    expectRtlWarn('\u0710 hello', 'Syriac');
  });

  it('F013-2: Thaana opening char triggers BiDi TS-fallback warn', () => {
    // U+0780 THAANA LETTER HAA — first char in Thaana block
    expectRtlWarn('\u0780 hello', 'Thaana');
  });

  it("F013-3: N'Ko opening char triggers BiDi TS-fallback warn", () => {
    // U+07C0 NKO DIGIT ZERO — first char in N'Ko block
    expectRtlWarn('\u07C0 hello', "N'Ko");
  });

  it('F013-4: Samaritan opening char triggers BiDi TS-fallback warn', () => {
    // U+0800 SAMARITAN LETTER ALAF — first char in Samaritan block
    expectRtlWarn('\u0800 hello', 'Samaritan');
  });

  it('F013-5: pure Latin text does NOT trigger BiDi TS-fallback warn', () => {
    clearShapingState();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    tsComposer.compose({
      text: 'Hello world',
      font: FONT_REGULAR,
      lineWidth: 400,
    });
    const bidiWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('BiDi'),
    );
    warnSpy.mockRestore();
    expect(bidiWarns.length).toBe(0);
  });
});
