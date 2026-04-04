# paragraf

[![CI](https://github.com/kadetr/paragraf/actions/workflows/ci.yml/badge.svg)](https://github.com/kadetr/paragraf/actions/workflows/ci.yml)

**Publication-quality typesetting in JavaScript.** The only Node.js library that produces print-grade output: Knuth-Plass optimal line breaking with real OpenType shaping, 22-language hyphenation, Unicode BiDi, optical margin alignment, and multi-frame document composition — outputting PDF, SVG, or Canvas.

**[→ Live demo](https://kadetr.github.io/paragraf/)**

---

## The problem

Generating documents programmatically in Node.js means choosing between:

- **Headless Chrome / Puppeteer** — renders HTML to PDF. Quality is whatever CSS gives you: greedy line breaking, no real hyphenation, no glyph-level metrics. Output looks like a webpage printed to PDF.
- **pdfmake / jsPDF** — programmatic PDF, but greedy line breaking and no OpenType shaping. Adequate for invoices and reports where typography quality doesn't matter.
- **LaTeX pipelines** — publication quality, but requires a full TeX installation, shell process overhead, and a separate templating system. Not a Node library.
- **InDesign Server** — the professional standard. Expensive, GUI-dependent, operationally complex, and not scriptable in JavaScript.

**paragraf is the missing option:** publication-quality typesetting as a Node.js library. No TeX installation, no browser process, no InDesign licence. The same class of output as InDesign, scriptable from TypeScript.

---

## What makes the difference

The core of every professional typesetting engine — InDesign, TeX, QuarkXPress — is the **Knuth-Plass algorithm**: solve the entire paragraph at once, minimising total spacing deviation across all lines simultaneously. The difference is visible:

![Knuth-Plass vs Greedy](docs/KP-Greedy.png)

Every JavaScript library uses a greedy algorithm — fill each line as full as possible, no lookahead. It's fast and simple, but it produces rivers of white space and inconsistent line density. paragraf uses Knuth-Plass with **real font metrics**: actual OpenType glyph advances from a Rust/WASM shaper (rustybuzz, the same shaping engine used by Firefox and Servo), not canvas measurement approximations or character-count estimates.

---

## How it compares

| Capability | paragraf | Puppeteer | pdfmake | LaTeX |
|---|:---:|:---:|:---:|:---:|
| Knuth-Plass line breaking | ✅ | — | — | ✅ |
| Real OpenType shaping (GSUB/GPOS) | ✅ | partial¹ | — | ✅ |
| 22-language hyphenation | ✅ | — | — | ✅ |
| Unicode BiDi (Arabic, Hebrew) | ✅ | ✅ | — | partial |
| Optical margin alignment | ✅ | — | — | ✅ |
| Multi-frame / multi-column layout | ✅ | via CSS | ✅ | ✅ |
| Selectable text in PDF output | ✅ | ✅ | ✅ | ✅ |
| Node-native (no browser subprocess) | ✅ | — | ✅ | — |
| Open source | ✅ | ✅ | ✅ | ✅ |

¹ Puppeteer delegates shaping to the OS renderer (CoreText/DirectWrite). Quality varies by platform and cannot be controlled programmatically.

**For browser-side KP line breaking** (injecting optimal word spacing back into DOM text), see [tex-linebreak](https://github.com/robertknight/tex-linebreak) by robertknight. That is a different problem — paragraf is a print and PDF pipeline, not a browser text renderer.

---

## Packages

Eight packages in strict layers. Each package only imports from layers below it.

| Folder | Package | What it does | Env |
|---|---|---|:---:|
| `0-types/` | `@paragraf/types` | Zero-dep shared interfaces: `Font`, `ComposedLine`, `FontRegistry`, `TextSpan` | both |
| `0-color/` | `@paragraf/color` | ICC colour profiles, sRGB/Lab/CMYK spaces, LUT interpolation | both |
| `1a-linebreak/` | `@paragraf/linebreak` | Knuth-Plass algorithm, 22-language hyphenation, traceback, node builder | both |
| `1b-font-engine/` | `@paragraf/font-engine` | FontEngine interface, fontkit adapter, measurer factory | both |
| `2a-shaping-wasm/` | `@paragraf/shaping-wasm` | Rust/WASM OpenType shaper (rustybuzz): GSUB ligatures, GPOS kerning, sups/subs | Node |
| `2b-render-core/` | `@paragraf/render-core` | Glyph layout → SVG / Canvas, document types | both |
| `3a-typography/` | `@paragraf/typography` | Paragraph compositor, OMA, BiDi, document model | Node |
| `3b-render-pdf/` | `@paragraf/render-pdf` | PDF output via pdfkit, selectable text overlay | Node |

---

## Architecture

```
0-types ──────────────────────────────────────────┐
   │                                               │
1a-linebreak        1b-font-engine ────────────────┤
   │                   │          │                │
   │           2a-shaping-wasm  2b-render-core     │
   │                   │          │                │
   └───────────────────┴──────────┘                │
                       │                           │
             3a-typography              3b-render-pdf
```

`3a-typography` and `3b-render-pdf` are true layer-3 siblings — neither depends on the other. `RenderedDocument` / `RenderedPage` live in `2b-render-core` so `render-pdf` works without `typography` for simpler pipelines.

---

## Quick start

```bash
npm install @paragraf/typography @paragraf/render-pdf
```

`@paragraf/types`, `@paragraf/linebreak`, `@paragraf/font-engine`, `@paragraf/render-core`, and `@paragraf/shaping-wasm` (including the prebuilt WASM binary) are all declared as direct dependencies of `@paragraf/typography` and install automatically.

```ts
import { createParagraphComposer, createDefaultFontEngine } from '@paragraf/typography';
import { createMeasurer }  from '@paragraf/font-engine';
import { layoutParagraph } from '@paragraf/render-core';
import { renderToPdf }     from '@paragraf/render-pdf';
import { writeFileSync }   from 'fs';

// 1. Register fonts
const registry = new Map([
  ['body', {
    id: 'body',
    face: 'SourceSerif4',
    filePath: './fonts/SourceSerif4-Regular.ttf',
  }],
]);

// 2. Compose — Knuth-Plass finds optimal line breaks for the whole paragraph
const composer = await createParagraphComposer(registry);
const { lines } = composer.compose({
  text:      'In olden times when wishing still helped one, there lived a king '
           + 'whose daughters were all beautiful.',
  font:      { id: 'body', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth:  396,   // points — 5.5 inches at 72pt/inch
  tolerance:  2,
  alignment: 'justified',
  language:  'en-us',
});

// 3. Layout — positions every glyph on the page
const measurer = createMeasurer(registry);
const rendered = layoutParagraph(lines, measurer, { x: 72, y: 72 });

// 4. Render to PDF — returns a Buffer
const engine    = await createDefaultFontEngine(registry);
const pdfBuffer = await renderToPdf(rendered, engine, {
  width:  595.28,   // A4
  height: 841.89,
});
writeFileSync('output.pdf', pdfBuffer);
```

### Selectable text (search and copy-paste in PDF viewers)

```ts
const pdfBuffer = await renderToPdf(rendered, engine, {
  width:        595.28,
  height:       841.89,
  selectable:   true,      // adds invisible text overlay at exact glyph positions
  fontRegistry: registry,  // required for font embedding
  title:        'My Document',
  lang:         'en',
});
```

### Multi-page documents

```ts
import { composeDocument, layoutDocument } from '@paragraf/typography';
import { renderDocumentToPdf }             from '@paragraf/render-pdf';

const doc = {
  paragraphs: [
    {
      text:      'First paragraph.',
      font:      { id: 'body', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
      lineWidth:  396,
      alignment: 'justified' as const,
    },
    {
      text:           'Second paragraph, indented.',
      font:           { id: 'body', size: 11, weight: 400, style: 'normal', stretch: 'normal' },
      lineWidth:       396,
      alignment:      'justified' as const,
      firstLineIndent: 11,
    },
  ],
  frames: [{
    page: 0, x: 72, y: 72, width: 396, height: 648,
  }],
};

const composed    = composeDocument(doc, composer);
const measurer    = createMeasurer(registry);
const renderedDoc = layoutDocument(composed, doc.frames, measurer);

const pdfBuffer = await renderDocumentToPdf(renderedDoc, engine, {
  pageWidth:  595.28,
  pageHeight: 841.89,
});
writeFileSync('document.pdf', pdfBuffer);
```

---

## Typography features

**Knuth-Plass parameters** — all TeX-equivalent controls exposed:

| Parameter | Default | Description |
|---|---|---|
| `tolerance` | `2` | How aggressively to fit lines; higher = more flexibility |
| `looseness` | `0` | `+1` prefer looser (more lines), `-1` prefer tighter |
| `emergencyStretch` | `0` | Extra stretch budget when no solution found at tolerance |
| `firstLineIndent` | `0` | First-line indent in points |
| `consecutiveHyphenLimit` | `∞` | Maximum consecutive hyphenated lines |
| `widowPenalty` | `150` | Penalty for last line alone at top of frame |
| `orphanPenalty` | `150` | Penalty for first line alone at bottom of frame |

**Language hyphenation** — 22 languages built in and managed:
`en-us` `en-gb` `de` `fr` `tr` `nl` `pl` `it` `es` `sv` `no` `da` `fi`
`hu` `cs` `sk` `ro` `hr` `sl` `lt` `lv` `et`

**OpenType shaping** — via rustybuzz (Rust port of HarfBuzz):
GSUB ligatures, GPOS kerning, superscript (`sups`), subscript (`subs`),
per-run letter-spacing, correct advance widths for all scripts

**Unicode BiDi** — full bidirectional algorithm for Arabic and Hebrew mixed with LTR text

**Optical margin alignment** — two-pass recomposition, punctuation hangs into margins,
per-character protrusion table

**Multi-frame document model** — multi-column, multi-frame, multi-page with baseline grid snapping

---

## Development

```bash
npm install   # install all workspace dependencies
npm test      # unit tests across all packages
npm run build # build all packages to dist/
```

The WASM shaper ships as a prebuilt binary (`2a-shaping-wasm/wasm/pkg/`). The Rust source is closed — only the compiled binary is in this repository. To rebuild the binary after modifying the Rust layer:

```bash
cd 2a-shaping-wasm/wasm
wasm-pack build --target nodejs                                   # Node
wasm-pack build --target bundler --out-dir pkg-bundler --release  # Browser (Vite)
```

`@paragraf/typography` auto-detects the WASM shaper at module init and falls back to the TypeScript fontkit path silently if WASM is absent. Check which path is active:

```ts
import { wasmStatus } from '@paragraf/typography';
console.log(wasmStatus()); // { status: 'loaded' | 'absent' | 'error' }
```

---

## Status

**v0.3.0 — pre-release.** The core algorithm and rendering pipeline are stable and well-tested (533 unit tests, 22 manual output scripts). APIs may change before v1.0. Not yet published to npm — GitHub only at this stage.

Planned before v1.0:
- `@paragraf/layout` — page geometry, unit converters (mm/inch/cm), named page sizes
- `@paragraf/style` — paragraph and character style system with inheritance
- `@paragraf/template` — document schema and data bindings
- `@paragraf/compile` — high-level orchestrator: template + data → PDF
- `@paragraf/color-wasm` — Rust/LCMS2 for ICC profiles and CMYK (print output)

See [`docs/`](docs/) for architecture details, IO schemas, and the document model reference.
See [`ROADMAP.md`](ROADMAP.md) for the full product roadmap.
