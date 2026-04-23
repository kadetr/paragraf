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

  // Converging OMA loop — mirrors createParagraphComposer in @paragraf/typography.
  // Iterate until break positions stabilise (or MAX_OMA_PASSES is reached):
  // each pass widens lineWidths based on the current line boundaries, recomposes,
  // and checks if the word-level line structure changed. Converges in ≤ 2 passes
  // for typical paragraphs.
  const MAX_OMA_PASSES = 5;
  let omaLines = runKP(lineWidth);

  const breaksMatch = (a: ComposedParagraph, b: ComposedParagraph): boolean => {
    if (a.length !== b.length) return false;
    return a.every(
      (la, i) =>
        la.words.length === b[i].words.length &&
        la.words.every((w, j) => w === b[i].words[j]),
    );
  };

  for (let pass = 0; pass < MAX_OMA_PASSES; pass++) {
    const { lineWidths } = buildOmaAdjustments(omaLines, lineWidth, measurer);
    const recomposed = runKP(lineWidth, lineWidths);
    const converged = breaksMatch(omaLines, recomposed);
    omaLines = recomposed;
    if (converged) break;
  }

  const { xOffsets, rightProtrusions } = buildOmaAdjustments(
    omaLines,
    lineWidth,
    measurer,
  );

  return omaLines.map((line, i) => ({
    ...line,
    xOffset: xOffsets[i] ?? 0,
    rightProtrusion: rightProtrusions[i] ?? 0,
  }));
}
