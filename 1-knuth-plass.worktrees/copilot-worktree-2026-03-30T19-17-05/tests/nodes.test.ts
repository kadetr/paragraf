import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { buildNodeSequence } from '../src/nodes';
import { hyphenateParagraph, loadLanguages } from '../src/hyphenate';
import { createMeasurer } from '../src/measure';
import {
  Font,
  FontRegistry,
  Node,
  Box,
  Glue,
  Penalty,
  FORCED_BREAK,
  HYPHEN_PENALTY,
  SOFT_HYPHEN_PENALTY,
} from '../src/types';
import { DEFAULT_HYPHENATE_OPTIONS } from '../src/hyphenate';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REGULAR_PATH = path.resolve(
  __dirname,
  '../fonts/LiberationSerif-Regular.ttf',
);
const BOLD_PATH = path.resolve(__dirname, '../fonts/LiberationSerif-Bold.ttf');

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
      face: 'Liberation Serif',
      filePath: REGULAR_PATH,
    },
  ],
  [
    'liberation-serif-bold',
    {
      id: 'liberation-serif-bold',
      face: 'Liberation Serif Bold',
      filePath: BOLD_PATH,
    },
  ],
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const boxes = (nodes: Node[]) => nodes.filter((n) => n.type === 'box') as Box[];
const glues = (nodes: Node[]) =>
  nodes.filter((n) => n.type === 'glue') as Glue[];
const penalties = (nodes: Node[]) =>
  nodes.filter((n) => n.type === 'penalty') as Penalty[];

beforeAll(async () => {
  await loadLanguages(['en-us']);
});

// ─── Basic structure ──────────────────────────────────────────────────────────

describe('buildNodeSequence — basic structure', () => {
  let nodes: Node[];

  beforeAll(() => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hi there friend');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    nodes = buildNodeSequence(withFonts, measurer);
  });

  it('produces a non-empty node sequence', () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('first node is a box', () => {
    expect(nodes[0].type).toBe('box');
  });

  it('last node is forced penalty', () => {
    const last = nodes[nodes.length - 1] as Penalty;
    expect(last.type).toBe('penalty');
    expect(last.penalty).toBe(FORCED_BREAK);
  });

  it('second to last node is termination glue', () => {
    const secondLast = nodes[nodes.length - 2] as Glue;
    expect(secondLast.type).toBe('glue');
    expect(secondLast.stretch).toBe(Infinity);
  });

  it('all box widths are positive', () => {
    boxes(nodes).forEach((b) => expect(b.width).toBeGreaterThan(0));
  });

  it('all glue widths are non-negative', () => {
    glues(nodes).forEach((g) => expect(g.width).toBeGreaterThanOrEqual(0));
  });
});

// ─── Hyphenation ──────────────────────────────────────────────────────────────

describe('buildNodeSequence — hyphenated words', () => {
  let nodes: Node[];

  beforeAll(() => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('beautiful');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    nodes = buildNodeSequence(withFonts, measurer);
  });

  it('produces hyphen penalties for a hyphenatable word', () => {
    const hyphenPenalties = penalties(nodes).filter(
      (p) => p.penalty === HYPHEN_PENALTY && p.flagged,
    );
    expect(hyphenPenalties.length).toBeGreaterThan(0);
  });

  it('hyphen penalty width is positive', () => {
    penalties(nodes)
      .filter((p) => p.flagged)
      .forEach((p) => expect(p.width).toBeGreaterThan(0));
  });

  it('fragments reassemble to original word', () => {
    const wordBoxes = boxes(nodes);
    expect(wordBoxes.map((b) => b.content).join('')).toBe('beautiful');
  });
});

// ─── Mixed fonts ──────────────────────────────────────────────────────────────

describe('buildNodeSequence — mixed fonts', () => {
  let nodes: Node[];

  beforeAll(() => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('the fox');
    const withFonts = hyphenated.map((w, i) => ({
      ...w,
      font: i === 0 ? FONT_REGULAR : FONT_BOLD,
    }));
    nodes = buildNodeSequence(withFonts, measurer);
  });

  it('first box carries regular font', () => {
    expect(boxes(nodes)[0].font.id).toBe('liberation-serif-regular');
  });

  it('second box carries bold font', () => {
    expect(boxes(nodes)[1].font.id).toBe('liberation-serif-bold');
  });

  it('box widths differ proving font is applied', () => {
    const wordBoxes = boxes(nodes);
    expect(wordBoxes[0].width).not.toBe(wordBoxes[1].width);
  });
});

// ─── Termination ──────────────────────────────────────────────────────────────

describe('buildNodeSequence — paragraph termination', () => {
  let nodes: Node[];

  beforeAll(() => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hello world');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    nodes = buildNodeSequence(withFonts, measurer);
  });

  it('termination glue has zero width', () => {
    expect((nodes[nodes.length - 2] as Glue).width).toBe(0);
  });

  it('termination glue has infinite stretch', () => {
    expect((nodes[nodes.length - 2] as Glue).stretch).toBe(Infinity);
  });

  it('termination glue has zero shrink', () => {
    expect((nodes[nodes.length - 2] as Glue).shrink).toBe(0);
  });

  it('forced penalty is -Infinity', () => {
    expect((nodes[nodes.length - 1] as Penalty).penalty).toBe(FORCED_BREAK);
  });
});

// ─── First line indent ────────────────────────────────────────────────────────

describe('buildNodeSequence — firstLineIndent', () => {
  it('no indent — first node is a box', () => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hello world');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    expect(nodes[0].type).toBe('box');
  });

  it('with indent — first node is a box with indent width', () => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hello world');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer, 24);
    expect(nodes[0].type).toBe('box');
    expect((nodes[0] as Box).width).toBe(24);
    expect((nodes[0] as Box).content).toBe('');
  });

  it('indent box has correct width', () => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hello world');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer, 36);
    expect((nodes[0] as Box).width).toBe(36);
  });

  it('indent zero produces no indent box', () => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('Hello world');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const noIndent = buildNodeSequence(withFonts, measurer, 0);
    const withIndent = buildNodeSequence(withFonts, measurer, 24);
    expect(withIndent.length).toBe(noIndent.length + 1);
  });

  it('second word box is still present after indent', () => {
    const measurer = createMeasurer(REGISTRY);
    // use words under minWordLength (5) to guarantee no hyphenation
    // "the" = 3 chars, "fox" = 3 chars — both produce exactly one Box
    const hyphenated = hyphenateParagraph('the fox');
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer, 24);
    // nodes[0]=indent, nodes[1]='the' box, nodes[2]=glue, nodes[3]='fox' box
    expect((nodes[1] as Box).content).toBe('the');
    expect((nodes[3] as Box).content).toBe('fox');
  });
});

// ─── Soft hyphen preservation ─────────────────────────────────────────────────

describe('buildNodeSequence — soft hyphen preservation', () => {
  it('soft hyphen word produces penalty with SOFT_HYPHEN_PENALTY', () => {
    const measurer = createMeasurer(REGISTRY);
    // 'co\u00ADoperate' — explicit soft hyphen between co and operate
    const hyphenated = hyphenateParagraph('co\u00ADoperate', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      preserveSoftHyphens: true,
    });
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);

    const softPenalties = penalties(nodes).filter(
      (p) => p.penalty === SOFT_HYPHEN_PENALTY && p.flagged,
    );
    expect(softPenalties.length).toBeGreaterThan(0);
  });

  it('soft hyphen penalty is lower than algorithmic hyphen penalty', () => {
    expect(SOFT_HYPHEN_PENALTY).toBeLessThan(HYPHEN_PENALTY);
  });

  it('soft hyphen fragments reassemble to original word', () => {
    const measurer = createMeasurer(REGISTRY);
    const hyphenated = hyphenateParagraph('co\u00ADoperate', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      preserveSoftHyphens: true,
    });
    const withFonts = hyphenated.map((w) => ({ ...w, font: FONT_REGULAR }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const wordBoxes = boxes(nodes);
    expect(wordBoxes.map((b) => b.content).join('')).toBe('cooperate');
  });
});

// ─── Letter spacing ───────────────────────────────────────────────────────────

describe('buildNodeSequence — letter spacing', () => {
  it('letter spacing increases box widths', () => {
    const measurer = createMeasurer(REGISTRY);

    const normalFont: Font = { ...FONT_REGULAR };
    const trackedFont: Font = { ...FONT_REGULAR, letterSpacing: 2 };

    const normalHyph = hyphenateParagraph('the fox');
    const trackedHyph = hyphenateParagraph('the fox');

    const normalNodes = buildNodeSequence(
      normalHyph.map((w) => ({ ...w, font: normalFont })),
      measurer,
    );
    const trackedNodes = buildNodeSequence(
      trackedHyph.map((w) => ({ ...w, font: trackedFont })),
      measurer,
    );

    const normalBoxes = normalNodes.filter((n) => n.type === 'box') as Box[];
    const trackedBoxes = trackedNodes.filter((n) => n.type === 'box') as Box[];

    // every content box should be wider with letter spacing
    normalBoxes.forEach((nb, i) => {
      const tb = trackedBoxes[i];
      if (nb.content.length > 1) {
        expect(tb.width).toBeGreaterThan(nb.width);
      }
    });
  });

  it('letter spacing on font is preserved in box font field', () => {
    const measurer = createMeasurer(REGISTRY);
    const trackedFont: Font = { ...FONT_REGULAR, letterSpacing: 1.5 };
    const hyphenated = hyphenateParagraph('the fox');
    const withFonts = hyphenated.map((w) => ({ ...w, font: trackedFont }));
    const nodes = buildNodeSequence(withFonts, measurer);
    const firstBox = nodes.find((n) => n.type === 'box') as Box;
    expect(firstBox.font.letterSpacing).toBe(1.5);
  });

  it('zero letter spacing produces same result as no letter spacing', () => {
    const measurer = createMeasurer(REGISTRY);
    const normalFont: Font = { ...FONT_REGULAR };
    const zeroFont: Font = { ...FONT_REGULAR, letterSpacing: 0 };

    const normalHyph = hyphenateParagraph('the fox');
    const zeroHyph = hyphenateParagraph('the fox');

    const normalNodes = buildNodeSequence(
      normalHyph.map((w) => ({ ...w, font: normalFont })),
      measurer,
    );
    const zeroNodes = buildNodeSequence(
      zeroHyph.map((w) => ({ ...w, font: zeroFont })),
      measurer,
    );

    const normalBoxes = normalNodes.filter((n) => n.type === 'box') as Box[];
    const zeroBoxes = zeroNodes.filter((n) => n.type === 'box') as Box[];

    normalBoxes.forEach((nb, i) => {
      expect(zeroBoxes[i].width).toBeCloseTo(nb.width, 5);
    });
  });
});
