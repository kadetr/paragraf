# paragraf

A TypeScript typesetting engine built around the Knuth-Plass optimum line-breaking algorithm. Produces publication-quality justified text with real font metrics, OpenType shaping, hyphenation, optical margin alignment, and multi-frame document composition — outputting SVG, Canvas, or PDF.

## Packages

| Package | Description | Browser |
|---|---|---|
| [`@paragraf/types`](0-types/) | Shared interfaces and constants | ✅ |
| [`@paragraf/linebreak`](1a-linebreak/) | Knuth-Plass algorithm + hyphenation | ✅ |
| [`@paragraf/font-engine`](1b-font-engine/) | Font metrics abstraction + fontkit adapter | ✅ |
| [`@paragraf/shaping-wasm`](2a-shaping-wasm/) | Rust/WASM OpenType shaper (rustybuzz) | — |
| [`@paragraf/render-core`](2b-render-core/) | Layout → SVG/Canvas rendering | ✅ |
| [`@paragraf/typography`](3a-typography/) | Compositor + document model (main entry point) | — |
| [`@paragraf/render-pdf`](3b-render-pdf/) | PDF output via pdfkit | — |

## Quick start

```bash
npm install @paragraf/typography @paragraf/render-core @paragraf/font-engine @paragraf/render-pdf
```

```ts
import { createParagraphComposer, createDefaultFontEngine } from '@paragraf/typography';
import { createMeasurer }    from '@paragraf/font-engine';
import { layoutParagraph }   from '@paragraf/render-core';
import { renderToPdf }       from '@paragraf/render-pdf';
import { createWriteStream } from 'fs';

const registry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
]);

const composer   = await createParagraphComposer(registry);
const engine     = await createDefaultFontEngine(registry);
const measurer   = await createMeasurer(registry);

const { lines } = composer.compose({
  text: 'The quick brown fox jumps over the lazy dog.',
  font: { id: 'regular', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth: 396,
  tolerance: 2,
  alignment: 'justified',
  language: 'en-us',
});

const rendered = layoutParagraph(lines, measurer, { x: 72, y: 72 });
await renderToPdf(rendered, engine, registry, createWriteStream('output.pdf'));
```

See [docs/getting-started.md](docs/getting-started.md) for a full walkthrough.

## Architecture

```
  ┌──────────────┐          ┌─────────────┐
  │   0-color    │          │   0-types   │
  │  (in progess)│          └──────┬──────┘
  └──────────────┘    ┌────────────┴────────────┐
                       ▼                         ▼
            ┌──────────────────┐     ┌──────────────────┐
            │  1a-linebreak    │     │  1b-font-engine  │
            └────────┬─────────┘     └────────┬─────────┘
                     │                ┌────────┴────────┐
                     │                ▼                 ▼
                     │  ┌──────────────────┐  ┌──────────────────┐
                     │  │ 2a-shaping-wasm  │  │  2b-render-core  │
                     │  └────────┬─────────┘  └────┬─────────────┘
                     │           │                  │
                     └───────────┤    ┌─────────────┤
                                 ▼    ▼             ▼
                      ┌──────────────────┐  ┌──────────────────┐
                      │  3a-typography   │  │  3b-render-pdf   │
                      └──────────────────┘  └──────────────────┘
```

## Development

```bash
npm install        # install all workspace dependencies
npm test           # run all tests across all packages
npm run build      # build all packages to dist/
```

### Repository layout

```
0-types/           @paragraf/types
1a-linebreak/      @paragraf/linebreak
1b-font-engine/    @paragraf/font-engine
2a-shaping-wasm/   @paragraf/shaping-wasm
2b-render-core/    @paragraf/render-core
3a-typography/     @paragraf/typography
3b-render-pdf/     @paragraf/render-pdf
docs/              architecture, roadmap, step task notes
manual/            manual test suite (real fonts, real output)
```

### WASM shaper

`@paragraf/shaping-wasm` wraps a Rust crate compiled with wasm-pack.
Rebuild after modifying `2a-shaping-wasm/wasm/src/lib.rs`:

```bash
cd 2a-shaping-wasm/wasm
wasm-pack build --target nodejs
```

`@paragraf/typography` auto-detects and uses the WASM shaper when available,
falling back to the TypeScript fontkit path silently.
