import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { renderToPdf, hitTestRendered } from '@paragraf/render-pdf';
import { layoutParagraph, RenderedParagraph } from '@paragraf/render-core';
import { createMeasurer, FontkitEngine } from '@paragraf/font-engine';
import { createParagraphComposer } from '@paragraf/typography';
import { Font, FontRegistry } from '@paragraf/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const SERIF_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const SERIF_FONT: Font = {
  id: 'liberation-serif',
  size: 14,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const SERIF_REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif',
    {
      id: 'liberation-serif',
      family: 'Liberation Serif',
      filePath: SERIF_PATH,
    },
  ],
]);

// ─── Setup ────────────────────────────────────────────────────────────────────

let rendered: RenderedParagraph;
let fontEngine: FontkitEngine;

beforeAll(async () => {
  fontEngine = new FontkitEngine();
  await fontEngine.loadFont('liberation-serif', SERIF_PATH);

  const composer = await createParagraphComposer(SERIF_REGISTRY);
  const output = composer.compose({
    text: 'The quick brown fox jumps over the lazy dog.',
    font: SERIF_FONT,
    lineWidth: 400,
  });
  const measurer = createMeasurer(SERIF_REGISTRY);
  rendered = layoutParagraph(output.lines, measurer, { x: 72, y: 72 });
});

// ─── selectable option ────────────────────────────────────────────────────────

describe('selectable option — guard', () => {
  it('throws when selectable is true but fontRegistry is omitted', async () => {
    await expect(
      renderToPdf(rendered, fontEngine, { selectable: true }),
    ).rejects.toThrow('fontRegistry');
  });
});

describe('selectable option — output content', () => {
  it('does not emit Tr=3 by default', async () => {
    const buf = await renderToPdf(rendered, fontEngine, { compress: false });
    expect(buf.toString('latin1')).not.toContain('3 Tr');
  });

  it('emits Tr=3 invisible text marker when selectable is true', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: SERIF_REGISTRY,
      compress: false,
    });
    expect(buf.toString('latin1')).toContain('3 Tr');
  });

  it('emits BT…ET text blocks when selectable is true', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: SERIF_REGISTRY,
      compress: false,
    });
    const s = buf.toString('latin1');
    expect(s).toContain('BT');
    expect(s).toContain('ET');
  });

  it('ToUnicode CMap is present when selectable is true', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: SERIF_REGISTRY,
    });
    expect(buf.toString('latin1')).toContain('ToUnicode');
  });

  it('selectable PDF is larger than non-selectable PDF', async () => {
    const base = await renderToPdf(rendered, fontEngine);
    const sel = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: SERIF_REGISTRY,
    });
    expect(sel.length).toBeGreaterThan(base.length);
  });
});

// ─── metadata options ─────────────────────────────────────────────────────────

describe('metadata options', () => {
  it('embeds document title in Info dict', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      title: 'Paragraf Test Doc',
    });
    expect(buf.toString('latin1')).toContain('Paragraf Test Doc');
  });

  it('title + selectable can be combined', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: SERIF_REGISTRY,
      title: 'Combined Test',
      compress: false,
    });
    const s = buf.toString('latin1');
    expect(s).toContain('3 Tr');
    expect(s).toContain('Combined Test');
  });
});

// ─── hitTestRendered (F034) ───────────────────────────────────────────────────

describe('hitTestRendered (F034)', () => {
  // RT-4: point squarely inside the first segment of the first line
  it('RT-4: point inside first segment → { lineIndex: 0, segmentIndex: 0 }', () => {
    const line = rendered[0];
    const seg = line.segments[0];
    // x: seg.x + 5 (inside segment), y: midpoint of line's vertical band
    const hit = hitTestRendered(rendered, {
      x: seg.x + 5,
      y: line.baseline - line.lineHeight / 2,
    });
    expect(hit).not.toBeNull();
    expect(hit!.lineIndex).toBe(0);
    expect(hit!.segmentIndex).toBe(0);
  });

  // RT-5: point far below all lines → null
  it('RT-5: point far below all lines → null', () => {
    const lastLine = rendered[rendered.length - 1];
    const hit = hitTestRendered(rendered, {
      x: 100,
      y: lastLine.baseline + 1000,
    });
    expect(hit).toBeNull();
  });

  // RT-5 ext: point far above all lines → null
  it('point far above all lines → null', () => {
    const firstLine = rendered[0];
    const hit = hitTestRendered(rendered, {
      x: 100,
      y: firstLine.baseline - firstLine.lineHeight - 1000,
    });
    expect(hit).toBeNull();
  });

  // RT-6: if paragraph has more than one line, a point in the second line → lineIndex: 1
  it('RT-6: point in second line → lineIndex: 1 (when paragraph has ≥2 lines)', () => {
    if (rendered.length < 2) return; // guard: skip for single-line renders
    const line1 = rendered[1];
    const hit = hitTestRendered(rendered, {
      x: line1.segments[0].x + 5,
      y: line1.baseline - line1.lineHeight / 2,
    });
    expect(hit).not.toBeNull();
    expect(hit!.lineIndex).toBe(1);
  });
});
