// manual/fixtures/documents.ts
// Reusable Frame and Document templates shared across MT scripts.

import { Frame, Document } from '../../src/document.js';
import { ParagraphInput } from '../../src/paragraph.js';
import { F12 } from './fonts.js';
import { DOCUMENT_PARA_1, DOCUMENT_PARA_2, DOCUMENT_PARA_3 } from './text.js';

// ─── Page constants ────────────────────────────────────────────────────────────

export const PAGE_W = 595.28; // A4 pts
export const PAGE_H = 841.89;
export const MARGIN_X = 72; // 1-inch left+right margins
export const MARGIN_TOP = 72;
export const CONTENT_W = PAGE_W - MARGIN_X * 2; // 451.28 pt
export const CONTENT_H = PAGE_H - MARGIN_TOP * 2; // 697.89 pt

// ─── Standard frames ──────────────────────────────────────────────────────────

/** Single-column full-page text frame. */
export const singleColumnFrame = (overrides?: Partial<Frame>): Frame => ({
  page: 0,
  x: MARGIN_X,
  y: MARGIN_TOP,
  width: CONTENT_W,
  height: CONTENT_H,
  columnCount: 1,
  ...overrides,
});

/** Two-column frame with 18pt gutter. */
export const twoColumnFrame = (overrides?: Partial<Frame>): Frame => ({
  page: 0,
  x: MARGIN_X,
  y: MARGIN_TOP,
  width: CONTENT_W,
  height: CONTENT_H,
  columnCount: 2,
  gutter: 18,
  ...overrides,
});

/** Single-column frame with a 14pt baseline grid (first baseline at 14pt). */
export const baselineGridFrame = (overrides?: Partial<Frame>): Frame => ({
  page: 0,
  x: MARGIN_X,
  y: MARGIN_TOP,
  width: CONTENT_W,
  height: CONTENT_H,
  columnCount: 1,
  grid: { first: 14, interval: 14 },
  ...overrides,
});

/** Two-column frame with a 14pt baseline grid. */
export const twoColumnGridFrame = (overrides?: Partial<Frame>): Frame => ({
  page: 0,
  x: MARGIN_X,
  y: MARGIN_TOP,
  width: CONTENT_W,
  height: CONTENT_H,
  columnCount: 2,
  gutter: 18,
  grid: { first: 14, interval: 14 },
  ...overrides,
});

// ─── Standard document ────────────────────────────────────────────────────────

/** Three-paragraph document using Document_PARA_1/2/3. Used by MT-13, MT-14. */
export const makeThreeParagraphDocument = (
  frames: Frame[],
  extraParagraphInput?: Partial<ParagraphInput>,
): Document => ({
  paragraphs: [DOCUMENT_PARA_1, DOCUMENT_PARA_2, DOCUMENT_PARA_3].map(
    (text) => ({
      text,
      font: F12,
      lineWidth: CONTENT_W, // overridden by composeDocument from frame
      ...extraParagraphInput,
    }),
  ),
  frames,
  styleDefaults: { tolerance: 3 },
});
