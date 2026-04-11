// demo/src/compose-kp.ts
// Knuth-Plass composition pipeline — uses pure-TS @paragraf/linebreak (browser-safe).
// loadHyphenator(language) must have been awaited before calling composeKP().

import type {
  Font,
  ComposedParagraph,
  FontRegistry,
  AlignmentMode,
} from '@paragraf/types';
import type { HyphenatedWordWithFont } from '@paragraf/linebreak';
import {
  hyphenateParagraph,
  buildNodeSequence,
  computeBreakpoints,
  traceback,
  composeParagraph,
} from '@paragraf/linebreak';
import { createBrowserMeasurer } from './measurer.js';

export interface ComposeKPOptions {
  tolerance?: number; // default: 2
  looseness?: number; // default: 0
  alignment?: AlignmentMode; // default: 'justified'
  language?: string; // default: 'en-us'
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

  const nodes = buildNodeSequence(wordsWithFont, measurer);

  const breakpointResult = computeBreakpoints({
    nodes,
    lineWidth,
    tolerance,
    emergencyStretch: 20,
    looseness,
  });

  const breaks = traceback(breakpointResult.node);

  return composeParagraph(nodes, breaks, alignment, false, lineWidth, [], (f) =>
    measurer.metrics(f),
  );
}
