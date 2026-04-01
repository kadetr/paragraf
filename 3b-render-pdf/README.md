# @paragraf/render-pdf

PDF output for paragraf via [pdfkit](https://pdfkit.org/). Renders composed
paragraphs and full documents to PDF files.

**Node.js only** (pdfkit depends on Node.js streams and the `fs` module).

## Install

```bash
npm install @paragraf/render-pdf @paragraf/render-core @paragraf/font-engine
```

## Usage

### Render a single paragraph

```ts
import { renderToPdf } from '@paragraf/render-pdf';
import { createWriteStream } from 'fs';

const stream = createWriteStream('output.pdf');

await renderToPdf(renderedParagraph, fontEngine, registry, stream, {
  width: 595.28,   // A4 width in points
  height: 841.89,  // A4 height in points
  fill: 'black',
});
```

### Render a full document

```ts
import { renderDocumentToPdf } from '@paragraf/render-pdf';
import { createWriteStream } from 'fs';

const stream = createWriteStream('document.pdf');

await renderDocumentToPdf(renderedDocument, fontEngine, registry, stream, {
  pageWidth: 595.28,
  pageHeight: 841.89,
  fill: 'black',
});
```

## Options

```ts
interface PdfOptions {
  width?: number;   // default 595.28 (A4)
  height?: number;  // default 841.89 (A4)
  fill?: string;    // glyph colour, default 'black'
}

interface DocumentPdfOptions {
  pageWidth?: number;   // default 595.28 (A4)
  pageHeight?: number;  // default 841.89 (A4)
  fill?: string;
}
```

## Full pipeline example

```ts
import { createParagraphComposer, createDefaultFontEngine } from '@paragraf/typography';
import { createMeasurer }                                   from '@paragraf/font-engine';
import { layoutParagraph }                                  from '@paragraf/render-core';
import { renderToPdf }                                      from '@paragraf/render-pdf';
import { createWriteStream }                                from 'fs';

const registry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
]);

const composer    = await createParagraphComposer(registry);
const fontEngine  = await createDefaultFontEngine(registry);
const measurer    = await createMeasurer(registry);

const { lines } = composer.compose({
  text: 'The quick brown fox jumps over the lazy dog.',
  font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth: 396,
  tolerance: 2,
  alignment: 'justified',
});

const rendered = layoutParagraph(lines, measurer, { x: 72, y: 72 });

const stream = createWriteStream('output.pdf');
await renderToPdf(rendered, fontEngine, registry, stream);
```

See the [getting started guide](../docs/getting-started.md) for a complete walkthrough.
