import { describe, it, expect } from 'vitest';
import { framesForRegions } from '../src/region-layout.js';

const TEXT_X = 40;
const TEXT_Y = 50;
const TEXT_W = 400;
const PAGE = 1;

describe('framesForRegions', () => {
  // RT1: single region, 1 column → 1 Frame with correct geometry
  it('RT1: single region 1 column produces 1 frame', () => {
    const frames = framesForRegions(
      [{ height: 100 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.x).toBe(TEXT_X);
    expect(f.y).toBe(TEXT_Y);
    expect(f.width).toBe(TEXT_W);
    expect(f.height).toBe(100);
    expect(f.page).toBe(PAGE);
  });

  // RT2: single region, 3 columns with gutter → 3 Frames with correct x and widths
  it('RT2: single region 3 columns with gutter produces 3 frames at correct offsets', () => {
    const gutter = 10;
    const frames = framesForRegions(
      [{ height: 80, columns: 3, gutter }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames).toHaveLength(3);
    const colW = (TEXT_W - gutter * 2) / 3;
    expect(frames[0].x).toBeCloseTo(TEXT_X);
    expect(frames[1].x).toBeCloseTo(TEXT_X + colW + gutter);
    expect(frames[2].x).toBeCloseTo(TEXT_X + 2 * (colW + gutter));
    frames.forEach((f) => {
      expect(f.width).toBeCloseTo(colW);
      expect(f.y).toBe(TEXT_Y);
      expect(f.height).toBe(80);
    });
  });

  // RT3: two regions, no explicit y → second region auto-stacks below first
  it('RT3: two regions auto-stack vertically', () => {
    const frames = framesForRegions(
      [{ height: 60 }, { height: 90 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames).toHaveLength(2);
    expect(frames[0].y).toBe(TEXT_Y + 0);
    expect(frames[1].y).toBe(TEXT_Y + 60);
  });

  // RT4: region with explicit y → absolute y respected, stack pointer still advances
  it('RT4: explicit y overrides auto-stack position', () => {
    const frames = framesForRegions(
      [{ height: 50, y: 200 }, { height: 30 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames[0].y).toBe(TEXT_Y + 200);
    // stack pointer advanced by 50 after region 0
    expect(frames[1].y).toBe(TEXT_Y + 50);
  });

  // RT5: region with x offset → frame.x = textX + region.x
  it('RT5: x offset shifts frame relative to text area', () => {
    const frames = framesForRegions(
      [{ height: 40, x: 20 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames[0].x).toBe(TEXT_X + 20);
  });

  // RT6: region with partial width → frame.width matches that width
  it('RT6: explicit width narrows the frame', () => {
    const frames = framesForRegions(
      [{ height: 50, width: 200 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      PAGE,
    );
    expect(frames[0].width).toBe(200);
  });

  // RT7: page argument propagates to all output frames
  it('RT7: page argument is set on all output frames', () => {
    const frames = framesForRegions(
      [{ height: 40 }, { height: 40, columns: 2, gutter: 5 }],
      TEXT_X,
      TEXT_Y,
      TEXT_W,
      7,
    );
    frames.forEach((f) => expect(f.page).toBe(7));
  });

  // RT8: empty regions array → returns []
  it('RT8: empty regions array returns empty array', () => {
    const frames = framesForRegions([], TEXT_X, TEXT_Y, TEXT_W, PAGE);
    expect(frames).toHaveLength(0);
  });
});
