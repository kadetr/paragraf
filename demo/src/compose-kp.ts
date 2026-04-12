// demo/src/compose-kp.ts
// Knuth-Plass composition pipeline — uses pure-TS @paragraf/linebreak (browser-safe).
// loadHyphenator(language) must have been awaited before calling composeKP().

import type {
  Font,
  ComposedParagraph,
  FontRegistry,
  AlignmentMode,
  Language,
} from '@paragraf/compile';
import type { HyphenatedWordWithFont } from '@paragraf/compile';
import {
  hyphenateParagraph,
  buildNodeSequence,
  computeBreakpoints,
  traceback,
  composeParagraph,
  buildOmaAdjustments,
} from '@paragraf/compile';
import { createBrowserMeasurer } from './measurer.js';

export interface ComposeKPOptions {
  tolerance?: number; // default: 2
  looseness?: number; // default: 0
  alignment?: AlignmentMode; // default: 'justified'
  language?: Language; // default: 'en-us'
  opticalMarginAlignment?: boolean; // default: false
}

export function composeKP(
  text: string,
  font: Font,
  lineWidth: number,
  registry: FontRegistry,
  opts: ComposeKPOptions = {},
): ComposedParagraph {
  const {
    tolerance = 2,
    looseness = 0,
    alignment = 'justified',
    language = 'en-us',
    opticalMarginAlignment = false,
  } = opts;

  const measurer = createBrowserMeasurer(registry);

  const hyphenated = hyphenateParagraph(text, {
    language,
    fontSize: font.size,
    minWordLength: 5,
    preserveSoftHyphens: true,
  });

  const wordsWithFont: HyphenatedWordWithFont[] = hyphenated.map((w) => ({
    ...w,
    font,
  }));

  function runKP(width: number, perLineWidths?: number[]): ComposedParagraph {
    const nodes = buildNodeSequence(wordsWithFont, measurer);
    const breakpointResult = computeBreakpoints({
      nodes,
      lineWidth: width,
      lineWidths: perLineWidths,
      tolerance,
      emergencyStretch: 20,
      looseness,
    });
    const breaks = traceback(breakpointResult.node);
    return composeParagraph(
      nodes,
      breaks,
      alignment,
      false,
      width,
      perLineWidths ?? [],
      (f) => measurer.metrics(f),
    );
  }

  if (!opticalMarginAlignment) {
    return runKP(lineWidth);
  }

  // Two-pass OMA: first pass at base width → extract per-line protrusions →
  // second pass with wider line widths → recompute xOffsets from second-pass
  // line boundaries (mirrors createParagraphComposer in @paragraf/typography).
  const firstPass = runKP(lineWidth);
  const { lineWidths } = buildOmaAdjustments(firstPass, lineWidth, measurer);
  const secondPass = runKP(lineWidth, lineWidths);
  const { xOffsets, rightProtrusions } = buildOmaAdjustments(
    secondPass,
    lineWidth,
    measurer,
  );

  // Apply xOffsets and rightProtrusions from OMA onto the final composed lines.
  return secondPass.map((line, i) => ({
    ...line,
    xOffset: xOffsets[i] ?? 0,
    rightProtrusion: rightProtrusions[i] ?? 0,
  }));
}
