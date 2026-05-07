// region-layout.ts — RegionSpec type and framesForRegions() for PageLayout.
// Geometry only. No ink, no colour, no rendering.

import type { Frame } from '@paragraf/types';
import { parseDimension, type Dimension } from './units.js';

/**
 * A rectangular region on a page, optionally sub-divided into columns.
 * Regions within a page stack vertically by default (auto-stack).
 * Set `y` explicitly to override the auto-stack position.
 */
export interface RegionSpec {
  /**
   * Height of the region in points or as a Dimension string.
   * Required — regions must have an explicit height.
   */
  height: Dimension;
  /**
   * Number of columns within this region. Defaults to 1.
   */
  columns?: number;
  /**
   * Space between columns in points or as a Dimension string. Defaults to 0.
   */
  gutter?: Dimension;
  /**
   * Horizontal offset from the left edge of the text area in points or as a
   * Dimension string. Defaults to 0 (flush with the left margin).
   */
  x?: Dimension;
  /**
   * Vertical offset from the top edge of the text area in points or as a
   * Dimension string. When omitted, the region is positioned immediately
   * below the previous region (auto-stack). When set, the value is used
   * as-is; the auto-stack pointer still advances by this region's height.
   */
  y?: Dimension;
  /**
   * Width of the region in points or as a Dimension string.
   * Defaults to the full text-area width (trimWidth − left margin − right margin).
   */
  width?: Dimension;
}

/**
 * Produce one Frame per column of each region, in reading order.
 *
 * @param regions    Array of region specifications.
 * @param textX      Left edge of the text area (bleed + margin.left).
 * @param textY      Top edge of the text area (bleed + margin.top).
 * @param textWidth  Full width of the text area (trimWidth − left − right margins).
 * @param page       0-based page index to stamp on every produced frame.
 * @returns          Flat Frame array: all columns of region[0], then region[1], etc.
 *
 * Output frames are single-column (no columnCount / gutter fields set).
 * Auto-stack: regions without an explicit `y` are positioned immediately below
 * the previous region. The stack pointer always advances by each region's height.
 */
export function framesForRegions(
  regions: RegionSpec[],
  textX: number,
  textY: number,
  textWidth: number,
  page: number,
): Frame[] {
  const frames: Frame[] = [];
  let stackY = 0; // running offset from textY for auto-stack

  for (const region of regions) {
    const regionHeight = parseDimension(region.height);
    const regionX = region.x !== undefined ? parseDimension(region.x) : 0;
    const regionY = region.y !== undefined ? parseDimension(region.y) : stackY;
    const regionWidth =
      region.width !== undefined ? parseDimension(region.width) : textWidth;
    const columns = region.columns ?? 1;
    const gutter =
      region.gutter !== undefined ? parseDimension(region.gutter) : 0;

    const colWidth =
      columns === 1
        ? regionWidth
        : (regionWidth - gutter * (columns - 1)) / columns;

    for (let c = 0; c < columns; c++) {
      frames.push({
        page,
        x: textX + regionX + c * (colWidth + gutter),
        y: textY + regionY,
        width: colWidth,
        height: regionHeight,
      });
    }

    stackY += regionHeight;
  }

  return frames;
}
