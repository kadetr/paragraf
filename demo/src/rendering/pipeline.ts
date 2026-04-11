// demo/src/rendering/pipeline.ts
// Shared render pipeline: params → compose (KP + Greedy) → layout → SVG strings.
// Pages call runPipeline() — they never touch compose/layout/render directly.

import type {
  Font,
  FontRegistry,
  AlignmentMode,
  ComposedParagraph,
} from '@paragraf/types';
import type { FontEngine } from '@paragraf/font-engine';
import type { ComposedLine } from '@paragraf/types';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { composeKP } from '../compose-kp.js';
import { composeGreedy } from '../compose-greedy.js';
import { createBrowserMeasurer } from '../measurer.js';

export interface PipelineParams {
  text: string;
  font: Font;
  lineWidth: number;
  tolerance: number;
  looseness: number;
  alignment: AlignmentMode;
  language: string;
  registry: FontRegistry;
  engine: FontEngine;
}

export interface PipelineResult {
  kp: string;
  greedy: string;
  kpLineCount: number;
  greedyLineCount: number;
  kpDemerits: number;
  emergencyCount: number;
  diffLineIndices: number[];
  kpComposed: ComposedParagraph;
  greedyComposed: ComposedParagraph;
}

const VIEWPORT_PADDING = 20;

/** Split raw text on blank lines into individual paragraph strings. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

function composedToSvg(
  paragraphs: ComposedParagraph[],
  lineWidth: number,
  engine: FontEngine,
  registry: FontRegistry,
): string {
  const allComposed = paragraphs.flat();
  if (allComposed.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${lineWidth}" height="0"></svg>`;
  }

  const measurer = createBrowserMeasurer(registry);
  const allRendered: ReturnType<typeof layoutParagraph> = [];
  let cursorY = VIEWPORT_PADDING;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const composed = paragraphs[pi];
    if (composed.length === 0) continue;
    const rendered = layoutParagraph(composed, measurer, {
      x: VIEWPORT_PADDING,
      y: cursorY,
    });
    allRendered.push(...rendered);
    cursorY += composed.reduce((sum, line) => sum + line.lineHeight, 0);
    // Add paragraph spacing (70% of a line height) between paragraphs
    if (pi < paragraphs.length - 1) {
      cursorY += composed[0].lineHeight * 0.7;
    }
  }

  const height = cursorY + VIEWPORT_PADDING;
  const width = lineWidth + VIEWPORT_PADDING * 2;

  return renderToSvg(allRendered, engine, { width, height });
}

export function runPipeline(params: PipelineParams): PipelineResult {
  const {
    text,
    font,
    lineWidth,
    tolerance,
    looseness,
    alignment,
    language,
    registry,
    engine,
  } = params;

  const paraTexts = splitParagraphs(text);
  const kpByPara: ComposedParagraph[] = [];
  const greedyByPara: ComposedParagraph[] = [];

  for (const para of paraTexts) {
    let kpPara: ComposedParagraph;
    try {
      kpPara = composeKP(para, font, lineWidth, registry, {
        tolerance,
        looseness,
        alignment,
        language,
      });
    } catch {
      kpPara = composeGreedy(para, font, lineWidth, registry, alignment);
    }
    kpByPara.push(kpPara);
    greedyByPara.push(
      composeGreedy(para, font, lineWidth, registry, alignment),
    );
  }

  const kpComposed: ComposedParagraph = kpByPara.flat();
  const greedyComposed: ComposedParagraph = greedyByPara.flat();

  const kp = composedToSvg(kpByPara, lineWidth, engine, registry);
  const greedy = composedToSvg(greedyByPara, lineWidth, engine, registry);

  return {
    kp,
    greedy,
    kpLineCount: kpComposed.length,
    greedyLineCount: greedyComposed.length,
    kpDemerits: 0, // demerits not surfaced through composeParagraph currently
    emergencyCount: 0,
    diffLineIndices: diffLines(kpComposed, greedyComposed),
    kpComposed,
    greedyComposed,
  };
}

/**
 * Returns the 0-based line indices where KP and greedy made different break
 * decisions (different word counts per line is the proxy).
 */
export function diffLines(
  kpLines: ComposedLine[],
  greedyLines: ComposedLine[],
): number[] {
  const maxLen = Math.max(kpLines.length, greedyLines.length);
  const indices: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const kLen = kpLines[i]?.wordRuns.length ?? -1;
    const gLen = greedyLines[i]?.wordRuns.length ?? -1;
    if (kLen !== gLen) indices.push(i);
  }
  return indices;
}
