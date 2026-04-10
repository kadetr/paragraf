import { describe, it, expect } from 'vitest';
import { PageLayout, columnWidths } from '../src/page-layout.js';
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

describe('columnWidths', () => {
  it('single-column frame returns [frame.width]', () => {
    const layout = new PageLayout({ size: 'A4', margins: MARGIN });
    const frame = layout.frames(1)[0];
    const widths = columnWidths(frame);
    expect(widths).toHaveLength(1);
    expect(widths[0]).toBeCloseTo(frame.width, 5);
  });

  it('two-column frame distributes width minus gutter', () => {
    const gutter = mm(5);
    const layout = new PageLayout({
      size: 'A4',
      margins: MARGIN,
      columns: 2,
      gutter,
    });
    const frame = layout.frames(1)[0];
    const widths = columnWidths(frame);
    const expected = (frame.width - gutter) / 2;
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBeCloseTo(expected, 5);
    expect(widths[1]).toBeCloseTo(expected, 5);
  });

  it('three-column frame returns three equal widths', () => {
    const gutter = mm(4);
    const layout = new PageLayout({
      size: 'A4',
      margins: MARGIN,
      columns: 3,
      gutter,
    });
    const frame = layout.frames(1)[0];
    const widths = columnWidths(frame);
    const expected = (frame.width - 2 * gutter) / 3;
    expect(widths).toHaveLength(3);
    for (const w of widths) expect(w).toBeCloseTo(expected, 5);
  });

  it('frame with no columnCount/gutter treated as single column', () => {
    const frame = { page: 0, x: 0, y: 0, width: 400, height: 600 };
    expect(columnWidths(frame)).toEqual([400]);
  });
});

// ─── PageLayout — constructor validation ──────────────────────────────────────

describe('PageLayout — constructor validation', () => {
  it('throws when bleed is negative', () => {
    expect(
      () => new PageLayout({ size: 'A4', margins: MARGIN, bleed: -1 }),
    ).toThrow(/bleed must be >= 0pt/);
  });

  it('throws when columns is 0', () => {
    expect(
      () => new PageLayout({ size: 'A4', margins: MARGIN, columns: 0 }),
    ).toThrow(/columns must be >= 1/);
  });

  it('throws when columns is negative', () => {
    expect(
      () => new PageLayout({ size: 'A4', margins: MARGIN, columns: -2 }),
    ).toThrow(/columns must be >= 1/);
  });

  it('throws when gutter is negative', () => {
    expect(
      () =>
        new PageLayout({ size: 'A4', margins: MARGIN, columns: 2, gutter: -5 }),
    ).toThrow(/gutter must be >= 0pt/);
  });

  it('throws when horizontal margins meet or exceed trim width', () => {
    // A4 is 595.28pt wide; margins of 300pt each → 600pt total > 595.28pt
    expect(
      () =>
        new PageLayout({
          size: 'A4',
          margins: { top: 10, right: 300, bottom: 10, left: 300 },
        }),
    ).toThrow(/left \+ right margins.*must be less than the trim width/);
  });

  it('throws when vertical margins meet or exceed trim height', () => {
    // A4 is 841.89pt tall; margins of 430pt each → 860pt total > 841.89pt
    expect(
      () =>
        new PageLayout({
          size: 'A4',
          margins: { top: 430, right: 10, bottom: 430, left: 10 },
        }),
    ).toThrow(/top \+ bottom margins.*must be less than the trim height/);
  });

  it('throws when gutter fills the text area', () => {
    // text width = 595.28 - 2*MARGIN; gutter set larger than that
    expect(
      () =>
        new PageLayout({
          size: 'A4',
          margins: MARGIN,
          columns: 2,
          gutter: 9999,
        }),
    ).toThrow(/gutter.*is wider than the available text area/);
  });
});
