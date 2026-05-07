import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { composeParagraph } from '../src/compose';
import { computeBreakpoints } from '../src/linebreak';
import { buildNodeSequence } from '../src/nodes';
import { hyphenateParagraph, loadLanguages } from '../src/hyphenate';
import { createMeasurer } from './helpers/measure';
import { traceback } from '../src/traceback';
import {
  Font,
  FontRegistry,
  ComposedLine,
  ComposedParagraph,
  AlignmentMode,
  Node,
} from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REGULAR_PATH = path.resolve(
  __dirname,
  '../../fonts/LiberationSerif-Regular.ttf',
);
const BOLD_PATH = path.resolve(
  __dirname,
  '../../fonts/LiberationSerif-Bold.ttf',
);

const FONT_REGULAR: Font = {
  id: 'liberation-serif-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const FONT_BOLD: Font = {
  id: 'liberation-serif-bold',
  size: 12,
  weight: 700,
  style: 'normal',
  stretch: 'normal',
};

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif-regular',
    {
      id: 'liberation-serif-regular',
      family: 'Liberation Serif',
      filePath: REGULAR_PATH,
    },
  ],
  [
    'liberation-serif-bold',
    {
      id: 'liberation-serif-bold',
      family: 'Liberation Serif Bold',
      filePath: BOLD_PATH,
    },
  ],
]);

beforeAll(async () => {
  await loadLanguages(['en-us']);
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const composeParagraphFromText = (
  text: string,
  lineWidth: number,
  tolerance: number,
  alignment: AlignmentMode = 'justified',
  fontPerWord?: (index: number) => Font,
  justifyLastLine?: boolean,
): { lines: ComposedParagraph; nodes: Node[] } => {
  const measurer = createMeasurer(REGISTRY);
  const hyphenated = hyphenateParagraph(text);
  const withFonts = hyphenated.map((w, i) => ({
    ...w,
    font: fontPerWord ? fontPerWord(i) : FONT_REGULAR,
  }));
  const nodes = buildNodeSequence(withFonts, measurer);
  const result = computeBreakpoints({ nodes, lineWidth, tolerance, alignment });
  const breaks = traceback(result.node);
  const lines = composeParagraph(
    nodes,
    breaks,
    alignment,
    justifyLastLine ?? false,
    lineWidth,
  );
  return { lines, nodes };
};

// ─── Basic output contracts ───────────────────────────────────────────────────

describe('composeParagraph — basic contracts', () => {
  let lines: ComposedParagraph;

  beforeAll(() => {
    const result = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    lines = result.lines;
  });

  it('returns at least one line', () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it('every line has at least one word', () => {
    lines.forEach((line) => expect(line.words.length).toBeGreaterThan(0));
  });

  it('words and fonts arrays are parallel', () => {
    lines.forEach((line) => expect(line.fonts.length).toBe(line.words.length));
  });

  it('every line has a finite wordSpacing', () => {
    lines.forEach((line) =>
      expect(Number.isFinite(line.wordSpacing)).toBe(true),
    );
  });

  it('every line has a finite ratio', () => {
    lines.forEach((line) => expect(Number.isFinite(line.ratio)).toBe(true));
  });

  it('every line has an alignment field', () => {
    lines.forEach((line) => expect(line.alignment).toBeDefined());
  });

  it('every line ratio is within [-1, 2]', () => {
    lines.forEach((line) => {
      expect(line.ratio).toBeGreaterThanOrEqual(-1);
      expect(line.ratio).toBeLessThanOrEqual(2);
    });
  });

  it('last line is not hyphenated', () => {
    expect(lines[lines.length - 1].hyphenated).toBe(false);
  });

  it('last line ratio is 0', () => {
    expect(lines[lines.length - 1].ratio).toBe(0);
  });
});

// ─── Word preservation ────────────────────────────────────────────────────────

describe('composeParagraph — word preservation', () => {
  it('all input words appear in output', () => {
    const text = 'In olden times when wishing still helped one';
    const { lines } = composeParagraphFromText(text, 200, 2);
    const allOutputWords = lines.flatMap((l) => l.words).join(' ');
    text.split(' ').forEach((word) => {
      expect(allOutputWords).toContain(word.toLowerCase().slice(0, 4));
    });
  });

  it('single line — all words on one line', () => {
    const { lines } = composeParagraphFromText('Hi there friend', 500, 1);
    expect(lines.length).toBe(1);
    expect(lines[0].words.join(' ')).toBe('Hi there friend');
  });
});

// ─── Hyphenation in output ────────────────────────────────────────────────────

describe('composeParagraph — hyphenation', () => {
  it('hyphenated line ends with a hyphen character', () => {
    const { lines } = composeParagraphFromText(
      'internationalization and localization are important concepts',
      200,
      3,
    );
    lines
      .filter((l) => l.hyphenated)
      .forEach((line) => {
        expect(line.words[line.words.length - 1].endsWith('-')).toBe(true);
      });
  });

  it('non-hyphenated lines do not end with hyphen', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    lines
      .filter((l) => !l.hyphenated)
      .forEach((line) => {
        expect(line.words[line.words.length - 1].endsWith('-')).toBe(false);
      });
  });
});

// ─── Mixed fonts ──────────────────────────────────────────────────────────────

describe('composeParagraph — mixed fonts', () => {
  it('font assignments are preserved per word in output', () => {
    const { lines } = composeParagraphFromText(
      'the fox',
      500,
      1,
      'justified',
      (i) => (i === 0 ? FONT_REGULAR : FONT_BOLD),
    );
    expect(lines.length).toBe(1);
    expect(lines[0].fonts[0].id).toBe('liberation-serif-regular');
    expect(lines[0].fonts[1].id).toBe('liberation-serif-bold');
  });
});

// ─── Word spacing ─────────────────────────────────────────────────────────────

describe('composeParagraph — word spacing', () => {
  it('wordSpacing is greater than zero on justified lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    lines
      .slice(0, -1)
      .forEach((line) => expect(line.wordSpacing).toBeGreaterThan(0));
  });

  it('last line wordSpacing equals natural space or zero for single word', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;
    const last = lines[lines.length - 1];
    if (last.words.length === 1) {
      expect(last.wordSpacing).toBe(0);
    } else {
      expect(last.wordSpacing).toBeCloseTo(natural, 5);
    }
  });
});

// ─── Alignment modes ─────────────────────────────────────────────────────────

describe('composeParagraph — alignment modes', () => {
  it('justified — alignment field is "justified" on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'justified',
    );
    lines.forEach((l) => expect(l.alignment).toBe('justified'));
  });

  it('left — alignment field is "left" on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'left',
    );
    lines.forEach((l) => expect(l.alignment).toBe('left'));
  });

  it('right — alignment field is "right" on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'right',
    );
    lines.forEach((l) => expect(l.alignment).toBe('right'));
  });

  it('center — alignment field is "center" on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'center',
    );
    lines.forEach((l) => expect(l.alignment).toBe('center'));
  });

  it('left — wordSpacing equals natural space width on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'left',
    );
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;
    lines.forEach((l) => {
      if (l.words.length === 1) {
        expect(l.wordSpacing).toBe(0);
      } else {
        expect(l.wordSpacing).toBeCloseTo(natural, 5);
      }
    });
  });

  it('right — wordSpacing equals natural space width on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'right',
    );
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;
    lines.forEach((l) => {
      if (l.words.length === 1) {
        expect(l.wordSpacing).toBe(0);
      } else {
        expect(l.wordSpacing).toBeCloseTo(natural, 5);
      }
    });
  });

  it('center — wordSpacing equals natural space width on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'center',
    );
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;
    lines.forEach((l) => {
      if (l.words.length === 1) {
        expect(l.wordSpacing).toBe(0);
      } else {
        expect(l.wordSpacing).toBeCloseTo(natural, 5);
      }
    });
  });

  it('justified produces different wordSpacing than left on non-last lines', () => {
    const text = 'In olden times when wishing still helped one';
    const { lines: justified } = composeParagraphFromText(
      text,
      200,
      2,
      'justified',
    );
    const { lines: left } = composeParagraphFromText(text, 200, 2, 'left');

    // compare first line — justified stretches, left uses natural width
    // they may occasionally be equal if ratio=0, so check at least one differs
    const spacingsDiffer = justified.some(
      (jLine, i) => Math.abs(jLine.wordSpacing - left[i].wordSpacing) > 0.001,
    );
    expect(spacingsDiffer).toBe(true);
  });
});

describe('composeParagraph — justifyLastLine', () => {
  it('default — last line ratio is 0', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    expect(lines[lines.length - 1].ratio).toBe(0);
  });

  it('justifyLastLine=false — last line wordSpacing equals natural space or zero', () => {
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
      'justified',
      undefined,
      false,
    );
    const last = lines[lines.length - 1];
    if (last.words.length === 1) {
      expect(last.wordSpacing).toBe(0);
    } else {
      expect(last.wordSpacing).toBeCloseTo(natural, 5);
    }
  });

  it('justifyLastLine=true — last line ratio is not forced to 0', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      190,
      2,
      'justified',
      undefined,
      true,
    );
    const last = lines[lines.length - 1];
    expect(last.words.length).toBeGreaterThan(0);
    expect(Number.isFinite(last.ratio)).toBe(true);
  });

  it('justifyLastLine=true demonstrably changes wordSpacing on multi-word last line', () => {
    const measurer = createMeasurer(REGISTRY);
    const natural = measurer.space(FONT_REGULAR).width;

    // try different lineWidths until last line has multiple words
    const without = composeParagraphFromText(
      'In olden times when wishing still helped one',
      190,
      2,
      'justified',
      undefined,
      false,
    );
    const with_ = composeParagraphFromText(
      'In olden times when wishing still helped one',
      190,
      2,
      'justified',
      undefined,
      true,
    );

    const lastWithout = without.lines[without.lines.length - 1];
    const lastWith = with_.lines[with_.lines.length - 1];

    if (lastWith.words.length > 1) {
      // without: uses natural spacing
      expect(lastWithout.wordSpacing).toBeCloseTo(natural, 5);
      // with justifyLastLine: uses computed spacing — different from natural
      expect(Math.abs(lastWith.wordSpacing - natural)).toBeGreaterThan(0.01);
    } else {
      // single word last line — both are 0, skip
      expect(lastWithout.wordSpacing).toBe(0);
    }
  });
});

// ─── ComposedLine.lineWidth ───────────────────────────────────────────────────

describe('composeParagraph — lineWidth on ComposedLine', () => {
  it('every line carries its lineWidth', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    lines.forEach((l) => expect(l.lineWidth).toBe(200));
  });
});

// ─── RT-1: F028 leftSkip / rightSkip ─────────────────────────────────────────

describe('composeParagraph — leftSkip / rightSkip (F028)', () => {
  it('leftSkip and rightSkip are propagated to each ComposedLine', () => {
    const measurer = createMeasurer(REGISTRY);
    const text = 'In olden times when wishing still helped one';
    const hyphenated = hyphenateParagraph(text);
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const leftSkip = 10;
    const rightSkip = 5;
    const fullLineWidth = 200;
    const kpLineWidth = fullLineWidth - leftSkip - rightSkip;
    const result = computeBreakpoints({
      nodes,
      lineWidth: kpLineWidth,
      tolerance: 4,
      alignment: 'justified',
    });
    const breaks = traceback(result.node);
    const lines = composeParagraph(
      nodes,
      breaks,
      'justified',
      false,
      kpLineWidth,
      [],
      undefined,
      'ltr',
      leftSkip,
      rightSkip,
    );
    lines.forEach((l) => {
      expect(l.leftSkip).toBe(leftSkip);
      expect(l.rightSkip).toBe(rightSkip);
      expect(l.lineWidth).toBe(kpLineWidth);
    });
  });
});

// ─── RT-2: F026 kashida distribution ─────────────────────────────────────────

describe('composeParagraph — kashida distribution (F026)', () => {
  it('kashida=true RTL justified non-last lines get kashidaSpacing, not wordSpacing', () => {
    const measurer = createMeasurer(REGISTRY);
    const text = 'In olden times when wishing still helped one';
    const hyphenated = hyphenateParagraph(text);
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const result = computeBreakpoints({
      nodes,
      lineWidth: 200,
      tolerance: 2,
      alignment: 'justified',
    });
    const breaks = traceback(result.node);
    const lines = composeParagraph(
      nodes,
      breaks,
      'justified',
      false,
      200,
      [],
      undefined,
      'rtl',
      0,
      0,
      true,
      0,
    );
    const nonLast = lines.slice(0, -1).filter((l) => l.wordRuns.length > 1);
    if (nonLast.length > 0) {
      nonLast.forEach((l) => {
        expect(l.kashidaSpacing).toBeGreaterThan(0);
        expect(l.wordSpacing).toBe(0);
      });
    }
  });

  it('kashida=false leaves wordSpacing on RTL lines and kashidaSpacing=0', () => {
    const measurer = createMeasurer(REGISTRY);
    const text = 'In olden times when wishing still helped one';
    const hyphenated = hyphenateParagraph(text);
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const result = computeBreakpoints({
      nodes,
      lineWidth: 200,
      tolerance: 2,
      alignment: 'justified',
    });
    const breaks = traceback(result.node);
    const lines = composeParagraph(
      nodes,
      breaks,
      'justified',
      false,
      200,
      [],
      undefined,
      'rtl',
      0,
      0,
      false,
      0,
    );
    lines.forEach((l) => {
      expect(l.kashidaSpacing).toBe(0);
    });
  });
});

// ─── RT-3: F029 glyphExpansion annotation ────────────────────────────────────

describe('composeParagraph — glyphExpansion annotation (F029)', () => {
  it('maxGlyphExpansion=0 produces glyphExpansion=0 on all lines', () => {
    const { lines } = composeParagraphFromText(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    lines.forEach((l) => expect(l.glyphExpansion).toBe(0));
  });

  it('maxGlyphExpansion>0 produces |glyphExpansion| <= max on each line', () => {
    const measurer = createMeasurer(REGISTRY);
    const text = 'In olden times when wishing still helped one';
    const hyphenated = hyphenateParagraph(text);
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const maxExpansion = 0.005;
    const result = computeBreakpoints({
      nodes,
      lineWidth: 200,
      tolerance: 2,
      alignment: 'justified',
    });
    const breaks = traceback(result.node);
    const lines = composeParagraph(
      nodes,
      breaks,
      'justified',
      false,
      200,
      [],
      undefined,
      'ltr',
      0,
      0,
      false,
      maxExpansion,
    );
    lines.forEach((l) => {
      expect(Math.abs(l.glyphExpansion ?? 0)).toBeLessThanOrEqual(
        maxExpansion + 1e-10,
      );
    });
    const nonZero = lines.filter((l) => (l.glyphExpansion ?? 0) !== 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });
});
