// page-layout.ts — PageLayout: constructs page geometry and Frame arrays.
// Geometry only. No ink, no colour, no rendering.

import type { Frame } from '@paragraf/types';
import { resolvePageSize, type PageSize } from './sizes.js';

/** Per-side margin values in points. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageLayoutOptions {
  /** Named page size or explicit [width, height] tuple in points. */
  size: PageSize;
  /**
   * Margins in points. Pass a single number for equal margins on all sides,
   * or a Margins object for per-side control.
   */
  margins: number | Margins;
  /** Number of text columns per frame. Defaults to 1. */
  columns?: number;
  /** Space between columns in points. Defaults to 0. */
  gutter?: number;
  /**
   * Bleed in points. The page size is expanded by this amount on all four
   * sides. Text frames are unaffected — they are still positioned relative
   * to the trim edge. Defaults to 0.
   */
  bleed?: number;
}

/** Axis-aligned rectangle in points. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveMargins(m: number | Margins): Margins {
  if (typeof m === 'number') {
    return { top: m, right: m, bottom: m, left: m };
  }
  return m;
}

export class PageLayout {
  private readonly _trimWidth: number;
  private readonly _trimHeight: number;
  private readonly _bleed: number;
  private readonly _margins: Margins;
  private readonly _columns: number;
  private readonly _gutter: number;

  constructor(opts: PageLayoutOptions) {
    const [w, h] = resolvePageSize(opts.size);
    this._trimWidth = w;
    this._trimHeight = h;
    this._bleed = opts.bleed ?? 0;
    this._margins = resolveMargins(opts.margins);
    this._columns = opts.columns ?? 1;
    this._gutter = opts.gutter ?? 0;
  }

  /**
   * Page dimensions in points **including bleed** on all four sides.
   * Use this for the PDF MediaBox.
   */
  get pageSize(): [number, number] {
    return [
      this._trimWidth + 2 * this._bleed,
      this._trimHeight + 2 * this._bleed,
    ];
  }

  /**
   * Page dimensions in points **without bleed** (the nominal/finished size).
   */
  get trimSize(): [number, number] {
    return [this._trimWidth, this._trimHeight];
  }

  /**
   * The cut-line rectangle — the finished page boundary within the
   * bleed-expanded page coordinate space.
   */
  get trimBox(): Rect {
    return {
      x: this._bleed,
      y: this._bleed,
      width: this._trimWidth,
      height: this._trimHeight,
    };
  }

  /**
   * The full bleed rectangle — covers the entire page including bleed area.
   * Equivalent to { x: 0, y: 0, width: pageSize[0], height: pageSize[1] }.
   */
  get bleedBox(): Rect {
    const [w, h] = this.pageSize;
    return { x: 0, y: 0, width: w, height: h };
  }

  /**
   * Produce one Frame per page, each filling the printable area defined by
   * the margins, positioned within the bleed-expanded coordinate space.
   *
   * @param pageCount Number of pages to produce frames for.
   */
  frames(pageCount: number): Frame[] {
    const result: Frame[] = [];

    const frameX = this._bleed + this._margins.left;
    const frameY = this._bleed + this._margins.top;
    const frameW = this._trimWidth - this._margins.left - this._margins.right;
    const frameH = this._trimHeight - this._margins.top - this._margins.bottom;

    for (let i = 0; i < pageCount; i++) {
      const frame: Frame = {
        page: i,
        x: frameX,
        y: frameY,
        width: frameW,
        height: frameH,
      };
      if (this._columns > 1) {
        frame.columnCount = this._columns;
        frame.gutter = this._gutter;
      }
      result.push(frame);
    }

    return result;
  }
}

/**
 * Compute the width of each text column within a frame.
 *
 * For frames with no `columnCount` (single-column), returns `[frame.width]`.
 * For multi-column frames, distributes `frame.width` evenly after subtracting
 * the total gutter space: `(frame.width - (n-1) × gutter) / n` for each column.
 */
export function columnWidths(frame: Frame): number[] {
  const count = frame.columnCount ?? 1;
  const gutter = frame.gutter ?? 0;
  const colWidth = (frame.width - (count - 1) * gutter) / count;
  return Array.from({ length: count }, () => colWidth);
}
