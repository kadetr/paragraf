// document.ts
//
// v0.9 Document Model: multi-paragraph, multi-frame, multi-page composition and layout.
//
// Two-pass pipeline:
//   1. composeDocument — runs Knuth-Plass for every paragraph (text → lines)
//   2. layoutDocument  — places lines into frames, columns, and pages

import {
  ParagraphComposer,
  ParagraphInput,
  ParagraphOutput,
} from './paragraph.js';
import { Measurer } from '@paragraf/types';
import {
  layoutParagraph,
  RenderedParagraph,
  BaselineGrid,
  Frame,
  RenderedItem,
  RenderedPage,
  RenderedDocument,
} from '@paragraf/render-core';

// Re-export so consumers of @paragraf/typography don't need to add render-core
export type {
  BaselineGrid,
  Frame,
  RenderedItem,
  RenderedPage,
  RenderedDocument,
};

// ─── Public types ─────────────────────────────────────────────────────────────

/** Input to the document model. */
export interface Document {
  /** Paragraphs to typeset, in order. */
  paragraphs: ParagraphInput[];
  /**
   * Frames that define the text area(s) on each page.
   * Text flows from frame[0] → frame[1] → … in document order.
   * Used by composeDocument to derive column width (from frame[0]).
   */
  frames: Frame[];
  /**
   * Default ParagraphInput fields applied to all paragraphs.
   * Per-paragraph fields always win over styleDefaults.
   */
  styleDefaults?: Partial<ParagraphInput>;
}

/** Intermediate result after composition but before layout. */
export interface ComposedDocument {
  paragraphs: Array<{
    output: ParagraphOutput;
    spaceBefore?: number;
    spaceAfter?: number;
  }>;
}

// ─── Baseline-grid helpers (exported for unit tests) ─────────────────────────

/**
 * Snap `cursorY` forward so that `cursorY + baseline` lands on the next grid
 * line at or above its current position.
 *
 * Grid lines are at:  origin + n * interval   (n = 0, 1, 2, …)
 * where              origin = frame.y + grid.first
 *
 * Formula:
 *   absBaseline = cursorY + baseline
 *   snappedAbs  = origin + ceil((absBaseline - origin) / interval) * interval
 *   result      = snappedAbs - baseline
 */
export function snapCursorToGrid(
  cursorY: number,
  baseline: number,
  frame: Frame,
  grid: BaselineGrid,
): number {
  const origin = frame.y + grid.first;
  const absBaseline = cursorY + baseline;
  const n = Math.ceil((absBaseline - origin) / grid.interval);
  return origin + n * grid.interval - baseline;
}

/**
 * Round `lineHeight` up to the nearest multiple of `interval`.
 * This is the amount to advance `cursorY` after placing a grid-snapped line.
 */
export function gridAdvance(lineHeight: number, interval: number): number {
  if (lineHeight <= 0) return 0;
  return Math.ceil(lineHeight / interval) * interval;
}

// ─── Column helpers ───────────────────────────────────────────────────────────

function colWidth(frame: Frame): number {
  const cols = frame.columnCount ?? 1;
  const gutter = frame.gutter ?? 0;
  return (frame.width - gutter * (cols - 1)) / cols;
}

function colX(frame: Frame, colIdx: number): number {
  const cw = colWidth(frame);
  const gutter = frame.gutter ?? 0;
  return frame.x + colIdx * (cw + gutter);
}

// ─── deriveLineWidths ─────────────────────────────────────────────────────────

/**
 * Return a copy of `paragraphs` where each item's `lineWidth` is set to the
 * column width of its assigned frame.
 *
 * This is the recommended way to handle documents that flow across frames with
 * different column widths (D5): pre-fill lineWidths before calling
 * `composeDocument`, so each paragraph is composed at the correct width.
 *
 * @param paragraphs   The original paragraph inputs.
 * @param frames       The frame sequence the document will flow through.
 * @param frameAssignments  Optional. `frameAssignments[i]` is the index into
 *   `frames` for paragraph `i`. Defaults to 0 for all paragraphs (same behaviour
 *   as `composeDocument` with a single frame).
 *
 * Note: the `lineWidth` set here takes precedence over `styleDefaults.lineWidth`
 * inside `composeDocument`, since it is placed directly on the paragraph object
 * which wins the spread merge.
 */
export function deriveLineWidths(
  paragraphs: ParagraphInput[],
  frames: Frame[],
  frameAssignments?: number[],
): ParagraphInput[] {
  return paragraphs.map((p, i) => {
    const fIdx = frameAssignments?.[i] ?? 0;
    const frame = frames[fIdx];
    return frame ? { ...p, lineWidth: colWidth(frame) } : { ...p };
  });
}

// ─── composeDocument ─────────────────────────────────────────────────────────

/**
 * Phase 1: run Knuth-Plass composition for each paragraph.
 *
 * - Merges styleDefaults into each paragraph (per-paragraph fields win).
 * - Overrides lineWidth with the column width derived from doc.frames[0].
 *   For documents that span frames with different column widths, call
 *   `deriveLineWidths` first to pre-fill the correct lineWidth on each
 *   paragraph before passing them to composeDocument.
 * - Calls composer.compose() for each merged input.
 * - Stores the original input (pre-merge) alongside the output.
 */
export function composeDocument(
  doc: Document,
  composer: ParagraphComposer,
): ComposedDocument {
  const firstFrame = doc.frames[0];
  const textWidth = firstFrame ? colWidth(firstFrame) : 0;

  if (doc.frames.length > 1) {
    const widths = doc.frames.map((f) => colWidth(f));
    const allSame = widths.every((w) => w === widths[0]);
    if (!allSame) {
      console.warn(
        '[paragraf] composeDocument: frames have different column widths. ' +
          'All paragraphs will be composed at frame[0] width (' +
          widths[0] +
          'pt). ' +
          'Call deriveLineWidths() to assign per-paragraph widths explicitly.',
      );
    }
  }

  const paragraphs = doc.paragraphs.map((input) => {
    const merged: ParagraphInput = {
      ...doc.styleDefaults,
      ...input,
      lineWidth:
        Number.isFinite(input.lineWidth) && input.lineWidth > 0
          ? input.lineWidth
          : Number.isFinite(doc.styleDefaults?.lineWidth) &&
              (doc.styleDefaults?.lineWidth ?? 0) > 0
            ? doc.styleDefaults!.lineWidth!
            : textWidth,
    };
    const output = composer.compose(merged);
    return {
      output,
      spaceBefore: merged.spaceBefore,
      spaceAfter: merged.spaceAfter,
    };
  });

  return { paragraphs };
}

// ─── layoutDocument ──────────────────────────────────────────────────────────

/**
 * Phase 2: place composed lines into frames, columns, and pages.
 *
 * Text flows as follows:
 *   • Within a frame: top to bottom, column by column (left to right).
 *   • When a frame fills: continues into the next entry in `frames`.
 *   • A paragraph may be split across columns or frames — each contiguous
 *     block of lines in one column becomes one RenderedItem.
 *   • A line that is taller than the remaining column height is placed
 *     anyway (force-place) to guarantee termination.
 */
export function layoutDocument(
  composed: ComposedDocument,
  frames: Frame[],
  measurer: Measurer,
): RenderedDocument {
  // Accumulate pages by index
  const pageMap = new Map<number, RenderedPage>();

  function getOrCreatePage(frame: Frame): RenderedPage {
    if (!pageMap.has(frame.page)) {
      pageMap.set(frame.page, { pageIndex: frame.page, frame, items: [] });
    }
    return pageMap.get(frame.page)!;
  }

  let frameIdx = 0;
  let colIdx = 0;
  let cursorY = frames.length > 0 ? frames[0].y : 0;
  let oversetLineCount = 0;

  for (const { output, spaceBefore, spaceAfter } of composed.paragraphs) {
    const lines = output.lines;
    let lineIdx = 0;
    let isFirstBatch = true;

    while (lineIdx < lines.length) {
      if (frameIdx >= frames.length) {
        // No more frames — count remaining lines as overset.
        oversetLineCount += lines.length - lineIdx;
        break;
      }

      const frame = frames[frameIdx];
      const available = frame.height - (cursorY - frame.y);

      // If the current column is exhausted, advance before placing anything.
      if (available <= 0) {
        const cols = frame.columnCount ?? 1;
        if (colIdx < cols - 1) {
          colIdx++;
          cursorY = frame.y;
        } else {
          frameIdx++;
          colIdx = 0;
          if (frameIdx < frames.length) {
            cursorY = frames[frameIdx].y;
          }
        }
        continue;
      }

      // Collect lines that fit in the remaining space.
      // When the frame has a baseline grid, we measure each line's snapped
      // contribution so the available-height check stays accurate.
      // Always take at least one line (force-place) to prevent an infinite loop
      // when a single line's lineHeight exceeds the column height.
      const fitLines: typeof lines = [];
      let totalHeight = 0;
      let isForcePlaced = false;
      while (lineIdx < lines.length) {
        const line = lines[lineIdx];
        const lh = frame.grid
          ? gridAdvance(line.lineHeight, frame.grid.interval)
          : line.lineHeight;
        if (fitLines.length === 0 || totalHeight + lh <= available) {
          if (fitLines.length === 0 && lh > available) isForcePlaced = true;
          fitLines.push(line);
          totalHeight += lh;
          lineIdx++;
        } else {
          break;
        }
      }

      // If the frame has a grid, snap the cursor before placing.
      // After snapping, the cursor may have moved forward enough that the
      // collected lines no longer fit within the frame.  In that case, flush to
      // the next column/frame and replay the lines there (unless this is a
      // force-placed line, which we always place to avoid an infinite loop).
      if (frame.grid && fitLines.length > 0) {
        const snappedY = snapCursorToGrid(
          cursorY,
          fitLines[0].baseline,
          frame,
          frame.grid,
        );
        const snapOverflow =
          !isForcePlaced && snappedY + totalHeight > frame.y + frame.height;
        if (snapOverflow) {
          // Restore lineIdx: the collected lines were not placed.
          lineIdx -= fitLines.length;
          const cols = frame.columnCount ?? 1;
          if (colIdx < cols - 1) {
            colIdx++;
            cursorY = frame.y;
          } else {
            frameIdx++;
            colIdx = 0;
            if (frameIdx < frames.length) {
              cursorY = frames[frameIdx].y;
            }
          }
          continue;
        }
        cursorY = snappedY;
      }

      // Apply spaceBefore on the first batch of this paragraph only.
      if (isFirstBatch && spaceBefore) {
        cursorY += spaceBefore;
      }

      // Place this batch as one item.
      const origin = { x: colX(frame, colIdx), y: cursorY };
      const rendered = layoutParagraph(fitLines, measurer, origin);
      getOrCreatePage(frame).items.push({
        origin,
        rendered,
        ...(isForcePlaced ? { forcePlaced: true } : {}),
      });
      cursorY += totalHeight;
      isFirstBatch = false;
      // Paragraph spacing: only applied after the *last* batch of a paragraph
      // (not mid-split when the paragraph continues into the next column/frame).
      const paragraphContinues = lineIdx < lines.length;
      if (!paragraphContinues && frameIdx < frames.length) {
        cursorY += frames[frameIdx].paragraphSpacing ?? 0;
        if (spaceAfter) cursorY += spaceAfter;
      }
      // (TODO v0.12: per-paragraph override via ParagraphInput.paragraphSpacing)

      // If the paragraph continues, advance to the next column or frame.
      if (paragraphContinues) {
        const cols = frame.columnCount ?? 1;
        if (colIdx < cols - 1) {
          colIdx++;
          cursorY = frame.y;
        } else {
          frameIdx++;
          colIdx = 0;
          if (frameIdx < frames.length) {
            cursorY = frames[frameIdx].y;
          }
        }
      }
    }
  }

  const pages = [...pageMap.values()].sort((a, b) => a.pageIndex - b.pageIndex);
  return {
    pages,
    ...(oversetLineCount > 0 ? { overset: true, oversetLineCount } : {}),
  };
}
