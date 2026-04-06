import { describe, it, expect } from 'vitest';
import { PageLayout } from '../src/page-layout.js';
import { mm } from '../src/units.js';
import { PAGE_SIZES } from '../src/sizes.js';

const A4_W = PAGE_SIZES.A4[0];
const A4_H = PAGE_SIZES.A4[1];
const MARGIN = mm(20);

describe('PageLayout — no bleed, single column', () => {
  const layout = new PageLayout({ size: 'A4', margins: MARGIN });

  it('pageSize equals A4 dimensions (no bleed)', () => {
    expect(layout.pageSize[0]).toBeCloseTo(A4_W, 5);
    expect(layout.pageSize[1]).toBeCloseTo(A4_H, 5);
  });

  it('trimSize equals A4 dimensions', () => {
    expect(layout.trimSize[0]).toBeCloseTo(A4_W, 5);
    expect(layout.trimSize[1]).toBeCloseTo(A4_H, 5);
  });

  it('trimBox equals bleedBox when bleed is 0', () => {
    const tb = layout.trimBox;
    const bb = layout.bleedBox;
    expect(tb.x).toBe(0);
    expect(tb.y).toBe(0);
    expect(tb.width).toBeCloseTo(bb.width, 5);
    expect(tb.height).toBeCloseTo(bb.height, 5);
  });

  it('frames(1) returns one frame for page 0', () => {
    const frames = layout.frames(1);
    expect(frames).toHaveLength(1);
    expect(frames[0].page).toBe(0);
  });

  it('frame dimensions equal page minus equal margins', () => {
    const frame = layout.frames(1)[0];
    expect(frame.x).toBeCloseTo(MARGIN, 5);
    expect(frame.y).toBeCloseTo(MARGIN, 5);
    expect(frame.width).toBeCloseTo(A4_W - 2 * MARGIN, 5);
    expect(frame.height).toBeCloseTo(A4_H - 2 * MARGIN, 5);
  });

  it('single-column frame has no columnCount/gutter set', () => {
    const frame = layout.frames(1)[0];
    expect(frame.columnCount).toBeUndefined();
    expect(frame.gutter).toBeUndefined();
  });
});

describe('PageLayout — two columns with gutter', () => {
  const layout = new PageLayout({
    size: 'A4',
    margins: MARGIN,
    columns: 2,
    gutter: mm(5),
  });

  it('frame carries columnCount and gutter', () => {
    const frame = layout.frames(1)[0];
    expect(frame.columnCount).toBe(2);
    expect(frame.gutter).toBeCloseTo(mm(5), 5);
  });
});

describe('PageLayout — bleed', () => {
  const BLEED = mm(3);
  const layout = new PageLayout({ size: 'A4', margins: MARGIN, bleed: BLEED });

  it('pageSize is larger than A4 by 2×bleed on each axis', () => {
    expect(layout.pageSize[0]).toBeCloseTo(A4_W + 2 * BLEED, 5);
    expect(layout.pageSize[1]).toBeCloseTo(A4_H + 2 * BLEED, 5);
  });

  it('trimSize is unchanged (A4)', () => {
    expect(layout.trimSize[0]).toBeCloseTo(A4_W, 5);
    expect(layout.trimSize[1]).toBeCloseTo(A4_H, 5);
  });

  it('trimBox is offset from page origin by bleed amount', () => {
    const tb = layout.trimBox;
    expect(tb.x).toBeCloseTo(BLEED, 5);
    expect(tb.y).toBeCloseTo(BLEED, 5);
    expect(tb.width).toBeCloseTo(A4_W, 5);
    expect(tb.height).toBeCloseTo(A4_H, 5);
  });

  it('bleedBox covers the full expanded page', () => {
    const bb = layout.bleedBox;
    expect(bb.x).toBe(0);
    expect(bb.y).toBe(0);
    expect(bb.width).toBeCloseTo(A4_W + 2 * BLEED, 5);
    expect(bb.height).toBeCloseTo(A4_H + 2 * BLEED, 5);
  });

  it('frame x,y are offset by bleed + margin', () => {
    const frame = layout.frames(1)[0];
    expect(frame.x).toBeCloseTo(BLEED + MARGIN, 5);
    expect(frame.y).toBeCloseTo(BLEED + MARGIN, 5);
  });
});

describe('PageLayout — multi-page', () => {
  const layout = new PageLayout({ size: 'A4', margins: MARGIN });

  it('frames(3) returns 3 frames with consecutive page indices', () => {
    const frames = layout.frames(3);
    expect(frames).toHaveLength(3);
    expect(frames[0].page).toBe(0);
    expect(frames[1].page).toBe(1);
    expect(frames[2].page).toBe(2);
  });

  it('all frames have identical geometry', () => {
    const frames = layout.frames(3);
    const [f0, f1, f2] = frames;
    expect(f1.x).toBe(f0.x);
    expect(f1.width).toBe(f0.width);
    expect(f2.height).toBe(f0.height);
  });
});

describe('PageLayout — custom size', () => {
  it('accepts a [width, height] tuple', () => {
    const layout = new PageLayout({ size: [300, 400], margins: 0 });
    expect(layout.trimSize).toEqual([300, 400]);
  });

  it('zero margins → frame fills the trim area exactly', () => {
    const layout = new PageLayout({ size: [300, 400], margins: 0 });
    const frame = layout.frames(1)[0];
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.width).toBe(300);
    expect(frame.height).toBe(400);
  });
});

describe('PageLayout — per-side margins object', () => {
  const margins = { top: mm(25), right: mm(15), bottom: mm(25), left: mm(20) };
  const layout = new PageLayout({ size: 'A4', margins });

  it('frame width reflects left + right margins', () => {
    const frame = layout.frames(1)[0];
    expect(frame.width).toBeCloseTo(A4_W - mm(15) - mm(20), 5);
  });

  it('frame height reflects top + bottom margins', () => {
    const frame = layout.frames(1)[0];
    expect(frame.height).toBeCloseTo(A4_H - mm(25) - mm(25), 5);
  });

  it('frame x = left margin, frame y = top margin', () => {
    const frame = layout.frames(1)[0];
    expect(frame.x).toBeCloseTo(mm(20), 5);
    expect(frame.y).toBeCloseTo(mm(25), 5);
  });
});
