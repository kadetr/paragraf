// tests/golden/export/render.ts
// Renders an export case (cases.ts EXPORT_CASES) to PDF and SVG, the same way
// every time, for export.test.ts and for the eye-check files.
//
// Determinism: pdfkit stamps /CreationDate with the current time and derives
// the trailer /ID from it in the PDFDocument constructor. Both are fixed here
// through render-pdf's existing `preDraw` hook, so no option is added to the
// public API. The hook runs after the constructor, so the /ID that pdfkit
// already computed is replaced as well (pdfkit keeps it in `doc._id`).
// Everything else pdfkit writes is already deterministic: the font subset
// tag is derived from the font's resource name, not from a random number.

import { createHash } from 'crypto';
import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
  type ParagraphComposer,
} from '@paragraf/typography';
import { createMeasurer, type FontEngine } from '@paragraf/font-engine';
import {
  layoutParagraph,
  renderToSvg,
  type RenderedParagraph,
  type RenderedDocument,
} from '@paragraf/render-core';
import {
  renderToPdf,
  renderDocumentToPdf,
  type PdfOptions,
} from '@paragraf/render-pdf';
import { loadBuiltinSrgb, type ColorTransform } from '@paragraf/color';
import type { FontRegistry, Measurer } from '@paragraf/types';
import {
  serifRegistry,
  hebrewRegistry,
  arabicRegistry,
} from '../../manual/fixtures/fonts.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
} from '../../manual/fixtures/documents.js';
import {
  CASES,
  type ExportCase,
  type GoldenCase,
  type RegistryName,
} from '../cases.js';

/** The date written into every test PDF. */
export const FIXED_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
/** The /ID written into every test PDF (16 bytes, as pdfkit uses). */
export const FIXED_ID = createHash('md5').update('paragraf-golden').digest();

/** A preDraw hook that makes the PDF independent of the clock. */
export const fixClock = (doc: any): void => {
  doc.info.CreationDate = FIXED_DATE;
  doc._id = FIXED_ID;
};

/**
 * A plain sRGB → CMYK conversion (K = 1 − max(R, G, B)). It stands in for an
 * ICC transform so that the expected channel values are easy to check by
 * hand: black is 0 0 0 1.
 */
export const naiveCmyk: ColorTransform = {
  apply: ([r = 0, g = 0, b = 0]) => {
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 1];
    return [
      (1 - r - k) / (1 - k),
      (1 - g - k) / (1 - k),
      (1 - b - k) / (1 - k),
      k,
    ];
  },
};

/**
 * The OutputIntent of the CMYK case. The profile bytes are the built-in sRGB
 * profile labelled as CMYK, because the repository holds no CMYK ICC file;
 * the PDF records /N 4 and the condition. A preflight tool will reject the
 * profile itself; the summary compares the intent's entries, not the
 * profile's colour data.
 */
export const cmykIntent = () => ({
  profile: { ...loadBuiltinSrgb(), colorSpace: 'CMYK' as const },
  condition: 'FOGRA39',
});

const REGISTRIES: Record<RegistryName, () => FontRegistry> = {
  serif: serifRegistry,
  hebrew: hebrewRegistry,
  arabic: arabicRegistry,
};

interface Kit {
  registry: FontRegistry;
  composer: ParagraphComposer;
  measurer: Measurer;
  fontEngine: FontEngine;
}

/**
 * Build the toolkit once. The TypeScript engine is used: it is always
 * available (the WASM shaper is a build artefact), and the layout snapshots
 * already compare the two engines. This baseline is about the export stage.
 */
export const createKits = async (): Promise<Map<RegistryName, Kit>> => {
  const kits = new Map<RegistryName, Kit>();
  for (const name of Object.keys(REGISTRIES) as RegistryName[]) {
    const registry = REGISTRIES[name]();
    const composer = await createParagraphComposer(registry, {
      useWasm: false,
    });
    for (const c of CASES) {
      if (c.registry === name && c.input.language)
        await composer.ensureLanguage(c.input.language);
    }
    kits.set(name, {
      registry,
      composer,
      measurer: createMeasurer(registry),
      fontEngine: await createDefaultFontEngine(registry, { useWasm: false }),
    });
  }
  return kits;
};

const caseById = (id: string): GoldenCase => {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`Export case refers to unknown case "${id}"`);
  return c;
};

export interface RenderOptions {
  /** pdfkit compression; the snapshots use false (the summary inflates either). */
  compress?: boolean;
}

export interface Rendered {
  pdf: Buffer;
  svg: string;
}

export const renderExportCase = async (
  e: ExportCase,
  kits: Map<RegistryName, Kit>,
  opts: RenderOptions = {},
): Promise<Rendered> => {
  const cases = e.from.map(caseById);
  const registry = cases[0].registry;
  if (cases.some((c) => c.registry !== registry))
    throw new Error(`Export case "${e.id}" mixes font registries`);
  const kit = kits.get(registry)!;

  const pdfOptions: PdfOptions = {
    width: PAGE_W,
    height: PAGE_H,
    compress: opts.compress ?? false,
    selectable: true,
    fontRegistry: kit.registry,
    title: e.id,
    lang: cases[0].input.language ?? 'en-us',
    preDraw: fixClock,
    ...(e.fill ? { fill: e.fill } : {}),
    ...(e.cmyk
      ? {
          colorTransform: naiveCmyk,
          outputIntent: cmykIntent(),
          pdfxConformance: 'PDF/X-3:2003' as const,
        }
      : {}),
  };

  if (e.frameHeight === undefined) {
    if (cases.length !== 1)
      throw new Error(`Export case "${e.id}": several cases need frameHeight`);
    const out = kit.composer.compose(cases[0].input);
    const rendered = layoutParagraph(out.lines, kit.measurer, {
      x: MARGIN_X,
      y: MARGIN_TOP,
    });
    const pdf = await renderToPdf(rendered, kit.fontEngine, pdfOptions);
    const svg = renderToSvg(rendered, kit.fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    });
    return { pdf, svg };
  }

  // Document: as many frames as there could be pages; empty ones add no page.
  const frames = Array.from({ length: 20 }, (_, page) => ({
    page,
    x: MARGIN_X,
    y: MARGIN_TOP,
    width: CONTENT_W,
    height: e.frameHeight!,
    columnCount: 1,
  }));
  const doc = {
    paragraphs: cases.map((c) => c.input),
    frames,
  };
  const composed = composeDocument(doc, kit.composer);
  const renderedDoc: RenderedDocument = layoutDocument(
    composed,
    frames,
    kit.measurer,
  );
  if (renderedDoc.overset)
    throw new Error(`Export case "${e.id}" does not fit in its frames`);
  const { width, height, preDraw, ...rest } = pdfOptions;
  const pdf = await renderDocumentToPdf(renderedDoc, kit.fontEngine, {
    ...rest,
    pageWidth: width,
    pageHeight: height,
    preDraw,
  });
  // The SVG renderer draws one page; the pages are stacked into one tall SVG.
  const stacked: RenderedParagraph = renderedDoc.pages.flatMap((p, i) =>
    p.items.flatMap((item) =>
      item.rendered.map((line) => ({
        ...line,
        baseline: line.baseline + i * PAGE_H,
        segments: line.segments.map((s) => ({ ...s, y: s.y + i * PAGE_H })),
      })),
    ),
  );
  const svg = renderToSvg(stacked, kit.fontEngine, {
    width: PAGE_W,
    height: PAGE_H * renderedDoc.pages.length,
  });
  return { pdf, svg };
};
