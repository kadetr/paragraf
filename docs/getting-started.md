# Getting Started

This guide walks through the full typesetting pipeline: from plain text input
to a justified PDF with real fonts.

## Prerequisites

- Node.js ≥ 18
- A `.ttf` or `.otf` font file

## 1. Install

```bash
npm install @paragraf/typography @paragraf/font-engine @paragraf/render-core @paragraf/render-pdf @paragraf/types
```

For TypeScript users, all packages ship type declarations — nothing extra needed.

---

## 2. Set up a font registry

All packages work with a `FontRegistry` — a `Map` from a string ID you choose
to a font descriptor:

```ts
import { FontRegistry } from '@paragraf/types';

const registry: FontRegistry = new Map([
  ['regular', {
    id: 'regular',
    face: 'SourceSerif4',
    filePath: './fonts/SourceSerif4-Regular.ttf',
  }],
  ['bold', {
    id: 'bold',
    face: 'SourceSerif4',
    filePath: './fonts/SourceSerif4-Bold.ttf',
  }],
]);
```

The `id` is the key you pass as `font.id` in all subsequent calls.
The `face` is the PostScript or family name used by the font engine internally.
The `filePath` points to the actual font file on disk.

---

## 3. Create a composer

`createParagraphComposer` loads the font registry, pre-loads the English
hyphenation dictionary, and returns a `ParagraphComposer`:

```ts
import { createParagraphComposer } from '@paragraf/typography';

const composer = await createParagraphComposer(registry);
```

Internally, it auto-detects whether the Rust/WASM shaper
(`@paragraf/shaping-wasm`) is available. If so, shaping and metrics come from
the compiled Rust path. If not, it falls back to the TypeScript fontkit path
transparently. You can check with:

```ts
import { wasmStatus } from '@paragraf/typography';
console.log(wasmStatus()); // { status: 'loaded' | 'absent' | 'error' }
```

---

## 4. Compose a paragraph

`composer.compose()` takes a `ParagraphInput` and returns composed lines:

```ts
import { Font } from '@paragraf/types';

const bodyFont: Font = {
  id: 'regular',
  size: 11,           // points
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const { lines, lineCount, usedEmergency } = composer.compose({
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '
      + 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  font: bodyFont,
  lineWidth: 396,         // 5.5 inches at 72 dpi
  tolerance: 2,           // Knuth-Plass tolerance (1 = tight, 10 = loose)
  alignment: 'justified',
  language: 'en-us',
});
```

`lines` is a `ComposedParagraph` — an array of `ComposedLine`, each containing
word content, spacing, hyphenation status, and metrics.

### Key options

| Option | Default | Description |
|---|---|---|
| `alignment` | `'justified'` | `'justified'` \| `'left'` \| `'right'` \| `'center'` |
| `tolerance` | `2` | How aggressively to fit lines; higher = more flexibility |
| `emergencyStretch` | `0` | Extra stretch budget for paragraphs that can't fit at tolerance |
| `looseness` | `0` | `+1` = prefer looser (more lines), `-1` = prefer tighter |
| `firstLineIndent` | `0` | First-line indent in points |
| `language` | `'en-us'` | Drives the hyphenation dictionary |
| `opticalMarginAlignment` | `false` | Hang punctuation and thin letters into margins |

---

## 5. Rich text (spans)

Use `spans` instead of `text` for multi-font paragraphs:

```ts
import { TextSpan } from '@paragraf/types';

const spans: TextSpan[] = [
  { text: 'This is ', font: bodyFont },
  { text: 'bold text', font: { ...bodyFont, id: 'bold', weight: 700 } },
  { text: ' back to regular.', font: bodyFont },
];

const { lines } = composer.compose({
  spans,
  font: bodyFont,   // used for glue/spacing metrics
  lineWidth: 396,
  alignment: 'justified',
});
```

---

## 6. Layout (compose → positioned segments)

`layoutParagraph` takes composed lines and a measurer, and returns absolute
x/y positions for every text segment on the page:

```ts
import { layoutParagraph } from '@paragraf/render-core';
import { createMeasurer }  from '@paragraf/font-engine';

const measurer = await createMeasurer(registry);

const rendered = layoutParagraph(lines, measurer, { x: 72, y: 72 });
// rendered: RenderedParagraph — array of RenderedLine
// Each line has: segments[].{ text, font, x, y }, baseline, lineHeight
```

The `origin` argument (`{ x: 72, y: 72 }`) places the top-left corner of the
text block in points from the page origin.

---

## 7. Output to PDF

```ts
import { createDefaultFontEngine } from '@paragraf/typography';
import { renderToPdf }             from '@paragraf/render-pdf';
import { writeFileSync }           from 'fs';

const fontEngine = await createDefaultFontEngine(registry);

const pdfBuffer = await renderToPdf(rendered, fontEngine, {
  width: 595.28,   // A4
  height: 841.89,
  fill: 'black',
});

writeFileSync('output.pdf', pdfBuffer);
```

---

## 8. Output to SVG

```ts
import { renderToSvg } from '@paragraf/render-core';

// fontEngine is from Section 7 (createDefaultFontEngine)
const svg = renderToSvg(rendered, fontEngine, { width: 595, height: 842 });
// svg: string — a complete <svg> element
```

---

## 9. Multi-paragraph documents

`composeDocument` + `layoutDocument` handle multi-paragraph, multi-frame,
multi-page flows:

```ts
import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
} from '@paragraf/typography';
import { createMeasurer }      from '@paragraf/font-engine';
import { renderDocumentToPdf } from '@paragraf/render-pdf';
import { writeFileSync }       from 'fs';

const registry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
]);

const composer   = await createParagraphComposer(registry);
const fontEngine = await createDefaultFontEngine(registry);
const measurer   = await createMeasurer(registry);

const doc = {
  paragraphs: [
    {
      text: 'First paragraph. It will be typeset and flowed into the frame.',
      font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
      lineWidth: 396,
      alignment: 'justified' as const,
    },
    {
      text: 'Second paragraph. Continues in the same frame after the first.',
      font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
      lineWidth: 396,
      alignment: 'justified' as const,
      firstLineIndent: 11,
    },
  ],
  frames: [{ x: 72, y: 72, width: 396, height: 648 }],
};

const composed       = composeDocument(doc, composer);
const renderedDoc    = layoutDocument(composed, measurer);

const pdfBuffer = await renderDocumentToPdf(renderedDoc, fontEngine, {
  pageWidth: 595.28,
  pageHeight: 841.89,
});

writeFileSync('document.pdf', pdfBuffer);
```

### Baseline grid

Add a `BaselineGrid` to snap all text to a consistent vertical rhythm:

```ts
import { BaselineGrid } from '@paragraf/render-core';

const grid: BaselineGrid = {
  leading: 14,    // line-to-line distance in points
  capHeight: 8,   // cap-height of the body font at body size
};

const renderedDoc = layoutDocument(composed, measurer, grid);
```

---

## 10. Hyphenation in other languages

```ts
const composer = await createParagraphComposer(registry);
await composer.ensureLanguage('de');
await composer.ensureLanguage('fr');

const { lines } = composer.compose({
  text: 'Schriftsetzer und Typografen arbeiten mit Bleisatz.',
  font: bodyFont,
  lineWidth: 396,
  language: 'de',
});
```

Supported languages: `en-us`, `en-gb`, `de`, `fr`, `tr`, `nl`, `pl`, `it`,
`es`, `sv`, `no`, `da`, `fi`, `hu`, `cs`, `sk`, `ro`, `hr`, `sl`, `lt`,
`lv`, `et`.

---

## Browser usage

The following packages are browser-safe (no Node.js dependencies):

- `@paragraf/types`
- `@paragraf/linebreak`
- `@paragraf/render-core`

For browser use, provide font data as `ArrayBuffer` and wire up your own
measurer using the low-level `@paragraf/linebreak` API.

`@paragraf/typography`, `@paragraf/shaping-wasm`, and `@paragraf/render-pdf`
are currently Node.js only.
