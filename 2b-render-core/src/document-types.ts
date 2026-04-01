// document-types.ts
//
// Data types for the document model output. Defined here (in render-core) so
// that render-pdf can consume them without depending on the full typography
// compositor package.

import type { RenderedParagraph } from './render.js';

/**
 * Baseline grid for a frame. When set on a Frame, every line placed inside
 * that frame is snapped so its baseline lands on a grid line.
 *
 * Grid lines are at: frame.y + first + n * interval  (n = 0, 1, 2, …)
 */
export interface BaselineGrid {
  /** Y-offset from frame.y where the first baseline lands. Typically = font ascender. */
  first: number;
  /** Distance between baseline grid lines in points. */
  interval: number;
}

/** A rectangular region on a specific page where text flows. */
export interface Frame {
  /** 0-based page index this frame lives on. */
  page: number;
  /** Left edge of the frame in points. */
  x: number;
  /** Top edge of the frame in points. */
  y: number;
  /** Total width of the frame (including gutters between columns) in points. */
  width: number;
  /** Total height of the frame in points. */
  height: number;
  /** Number of columns. Defaults to 1. */
  columnCount?: number;
  /** Space between columns in points. Defaults to 0. */
  gutter?: number;
  /** Optional baseline grid. When set, line placement snaps to grid. */
  grid?: BaselineGrid;
  /**
   * Vertical gap in points inserted after each paragraph placed in this frame.
   * Applied after every paragraph (including the last — it is simply added to
   * cursorY and has no visible effect unless another paragraph follows).
   * Defaults to 0.
   */
  paragraphSpacing?: number;
}

/** A single rendered block of lines within a column on a page. */
export interface RenderedItem {
  origin: { x: number; y: number };
  rendered: RenderedParagraph;
}

/** All rendered items on a single page. */
export interface RenderedPage {
  pageIndex: number;
  /** The frame that initiated this page (the frame with frame.page === pageIndex). */
  frame: Frame;
  items: RenderedItem[];
}

/** Final output: one entry per page that has content. */
export interface RenderedDocument {
  pages: RenderedPage[];
}
