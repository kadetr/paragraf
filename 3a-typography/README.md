# @paragraf/typography

Paragraph compositor and document model. The top-level orchestrator —
takes text input and font registry, returns composed + ready-to-render output.

Wraps `@paragraf/linebreak`, `@paragraf/font-engine`, and
`@paragraf/shaping-wasm` into a single high-level API.

## Install

```bash
npm install @paragraf/typography @paragraf/font-engine @paragraf/types
```

## Quick start

```ts
import { createParagraphComposer } from '@paragraf/typography';
import { FontRegistry } from '@paragraf/types';

const registry: FontRegistry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
]);

const composer = await createParagraphComposer(registry);

const { lines } = composer.compose({
  text: 'The quick brown fox jumps over the lazy dog.',
  font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth: 396, // points (5.5 inches)
  tolerance: 2,
  language: 'en-us',
  alignment: 'justified',
});
```

## `ParagraphInput`

```ts
interface ParagraphInput {
  // Plain text — single font
  text?: string;
  font: Font;

  // Rich text — per-run fonts (mutually exclusive with text)
  spans?: TextSpan[];

  lineWidth: number;
  lineWidths?: number[];        // per-line widths for shaped columns
  tolerance?: number;           // Knuth-Plass tolerance, default 2
  emergencyStretch?: number;    // fallback stretch when no solution found
  firstLineIndent?: number;
  alignment?: AlignmentMode;    // 'justified' | 'left' | 'right' | 'center'
  language?: Language;          // default 'en-us'
  looseness?: number;           // 0 = optimum, -1 = tighter, +1 = looser
  justifyLastLine?: boolean;
  consecutiveHyphenLimit?: number;
  widowPenalty?: number;
  orphanPenalty?: number;
  opticalMarginAlignment?: boolean; // hang punctuation into margins
}
```

## `ParagraphOutput`

```ts
interface ParagraphOutput {
  lines: ComposedParagraph;
  lineCount: number;
  usedEmergency: boolean; // true if emergencyStretch was needed
}
```

## Multi-language paragraphs

```ts
const composer = await createParagraphComposer(registry);
// Pre-load additional hyphenation dictionaries
await composer.ensureLanguage('de');

const { lines } = composer.compose({ text: '...', font, lineWidth: 396, language: 'de' });
```

## Document composition

```ts
import { composeDocument, layoutDocument } from '@paragraf/typography';
import { createMeasurer }                  from '@paragraf/font-engine';

const measurer = createMeasurer(registry);

const doc: Document = {
  paragraphs: [...],
  // baseline grid lives on each Frame, not on Document:
  frames: [{ page: 0, x: 72, y: 72, width: 396, height: 648 }],
  // with baseline grid:
  // frames: [{ page: 0, x: 72, y: 72, width: 396, height: 648,
  //            grid: { first: 9, interval: 14 } }],
};

const composed    = composeDocument(doc, composer);
const renderedDoc = layoutDocument(composed, doc.frames, measurer);
// renderedDoc.pages: RenderedPage[]
```

## WASM status

```ts
import { wasmStatus } from '@paragraf/typography';

const { status } = wasmStatus();
// 'loaded'  — Rust shaping active
// 'absent'  — wasm/pkg not built; TypeScript fallback active
// 'error'   — build present but failed to init
```

## Optical margin alignment

```ts
const { lines } = composer.compose({
  text: '"Opening quote and punctuation hang into the margin."',
  font, lineWidth: 396,
  opticalMarginAlignment: true,
});
// each line.xOffset is the left-margin protrusion in points
```

## Cache benchmark (workId 005)

Typography owns the integration benchmark for shaping-result cache behavior.

Run from this package:

```bash
npm run benchmark:cache
```

Output includes:

- cold/warm latency and delta
- measure-cache hit/miss/eviction stats
- heap delta
- shaping-wasm face-cache stats snapshot (when available)
