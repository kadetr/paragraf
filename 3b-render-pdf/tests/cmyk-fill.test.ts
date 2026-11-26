// CMYK fills must reach the PDF at full strength.
//
// A ColorTransform returns channels in [0, 1]. pdfkit takes CMYK in [0, 100]
// and divides by 100, so passing [0, 0, 0, 1] through unchanged wrote
// "0 0 0 0.01": one per cent black instead of solid black (v0.7.0).

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { renderToPdf, renderDocumentToPdf } from '@paragraf/render-pdf';
import { layoutParagraph, RenderedParagraph } from '@paragraf/render-core';
import { createMeasurer, FontkitEngine } from '@paragraf/font-engine';
import { createParagraphComposer } from '@paragraf/typography';
import { Font, FontRegistry } from '@paragraf/types';

const SERIF_PATH = path.resolve(
  __dirname,
  '../../fonts/LiberationSerif-Regular.ttf',
);
const FONT: Font = {
  id: 'liberation-serif',
  size: 14,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};
const REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif',
    {
      id: 'liberation-serif',
      family: 'Liberation Serif',
      filePath: SERIF_PATH,
    },
  ],
]);

// Every CMYK fill operator in an uncompressed PDF, as four numbers each.
const cmykFills = (pdf: Buffer): number[][] =>
  [
    ...pdf
      .toString('latin1')
      .matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) (?:k|scn)$/gm),
  ].map((m) => m.slice(1, 5).map(Number));

let rendered: RenderedParagraph;
let fontEngine: FontkitEngine;

beforeAll(async () => {
  fontEngine = new FontkitEngine();
  await fontEngine.loadFont('liberation-serif', SERIF_PATH);
  const composer = await createParagraphComposer(REGISTRY);
  const output = composer.compose({ text: 'Ink', font: FONT, lineWidth: 400 });
  rendered = layoutParagraph(output.lines, createMeasurer(REGISTRY), {
    x: 72,
    y: 72,
  });
});

describe('CMYK fill strength', () => {
  it('solid black from the transform is written as 0 0 0 1', async () => {
    const pdf = await renderToPdf(rendered, fontEngine, {
      compress: false,
      colorTransform: { apply: () => [0, 0, 0, 1] },
    });
    const fills = cmykFills(pdf);
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) expect(f).toEqual([0, 0, 0, 1]);
  });

  it('keeps each channel value', async () => {
    const pdf = await renderToPdf(rendered, fontEngine, {
      compress: false,
      colorTransform: { apply: () => [0.2, 0.4, 0.6, 0.8] },
    });
    const fills = cmykFills(pdf);
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      expect(f[0]).toBeCloseTo(0.2, 6);
      expect(f[1]).toBeCloseTo(0.4, 6);
      expect(f[2]).toBeCloseTo(0.6, 6);
      expect(f[3]).toBeCloseTo(0.8, 6);
    }
  });

  it('clamps out-of-range channels to 0..1', async () => {
    const pdf = await renderToPdf(rendered, fontEngine, {
      compress: false,
      colorTransform: { apply: () => [-0.5, 0, 0, 1.5] },
    });
    for (const f of cmykFills(pdf)) expect(f).toEqual([0, 0, 0, 1]);
  });

  it('document rendering writes the same strength', async () => {
    const pdf = await renderDocumentToPdf(
      {
        pages: [
          {
            pageIndex: 0,
            frame: { page: 0, x: 72, y: 72, width: 400, height: 400 },
            items: [{ origin: { x: 72, y: 72 }, rendered }],
          },
        ],
      } as never,
      fontEngine,
      { compress: false, colorTransform: { apply: () => [0, 0, 0, 1] } },
    );
    const fills = cmykFills(pdf);
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) expect(f).toEqual([0, 0, 0, 1]);
  });
});
