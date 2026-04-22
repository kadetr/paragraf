// document-types.ts
//
// Data types for the document model output. Defined here (in render-core) so
// that render-pdf can consume them without depending on the full typography
// compositor package.
//
// Frame and BaselineGrid have been promoted to @paragraf/types (Layer 0) so
// that @paragraf/layout (Layer 1) can use them without a cross-layer dep.

import type { RenderedParagraph } from './render.js';
import type { Frame, BaselineGrid } from '@paragraf/types';
export type { Frame, BaselineGrid };

/** A single rendered block of lines within a column on a page. */
export interface RenderedItem {
  origin: { x: number; y: number };
  rendered: RenderedParagraph;
  /** True if at least one line in this item was force-placed (taller than remaining column height). */
  forcePlaced?: boolean;
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
  /** True if any composed lines were discarded because all frames were exhausted. */
  overset?: boolean;
  /** Count of lines that could not be placed (0 or absent when overset is false). */
  oversetLineCount?: number;
}
