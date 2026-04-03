// demo/src/compose-kp.ts
// Knuth-Plass composition pipeline — uses pure-TS @paragraf/linebreak (browser-safe).
// loadHyphenator('en-us') must have been awaited before calling composeKP().

import type { Font, ComposedParagraph, FontRegistry } from '@paragraf/types';
import type { HyphenatedWordWithFont } from '@paragraf/linebreak';
import {
  hyphenateParagraph,
  buildNodeSequence,
  computeBreakpoints,
  traceback,
  composeParagraph,
} from '@paragraf/linebreak';
import { createBrowserMeasurer } from './measurer.js';

export function composeKP(
  text: string,
  font: Font,
  lineWidth: number,
  registry: FontRegistry,
): ComposedParagraph {
  const measurer = createBrowserMeasurer(registry);

  // hyphenateParagraph uses the already-loaded hyphenator cache (sync after loadHyphenator)
  const hyphenated = hyphenateParagraph(text, {
    language: 'en-us',
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
    tolerance: 2,
    emergencyStretch: 20,
    looseness: 0,
  });

  const breaks = traceback(breakpointResult.node);

  return composeParagraph(
    nodes,
    breaks,
    'justified',
    false,
    lineWidth,
    [],
    (font) => measurer.metrics(font),
  );
}
