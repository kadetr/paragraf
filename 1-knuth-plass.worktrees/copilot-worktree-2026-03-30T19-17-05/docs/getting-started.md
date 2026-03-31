# Getting Started

This guide takes you from zero to a composed paragraph with optional PDF output. It covers installation, the optional WASM build, running the test suite, and two working code examples.

---

## 1. Prerequisites and install

**Node.js 18 or later** is required. If you manage Node versions with nvm:

```sh
nvm install 20
nvm use 20
```

Install from [nodejs.org](https://nodejs.org) if you prefer a direct installer.

**Clone and install dependencies:**

```sh
git clone https://github.com/kadetr/paragraf-knuth-plass.git
cd knuth-plass
npm install
```

TypeScript is a `devDependency` — `npx tsx` is available immediately after `npm install`. No global TypeScript or ts-node install is needed.

---

## 2. WASM setup

> **Currently optional for Latin-script text composition.** Without WASM, the library falls back to the TypeScript + opentype.js path automatically — all current features work in both paths.
>
> **Required for the following planned features (next roadmap phase):**
> - BiDi / RTL text (Arabic, Hebrew, Persian) — requires HarfBuzz
> - Full OpenType feature support (GPOS, contextual substitution, stylistic sets) — requires HarfBuzz
> - CJS elimination (removing the opentype.js dependency entirely) — requires the WASM port
>
> If you are building for production publishing or multilingual support, set up WASM now.

### Prerequisites

Install Rust via [rustup](https://rustup.rs):

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Add the WASM compilation target and install `wasm-pack`:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### Build

From the repository root:

```sh
wasm-pack build --target nodejs wasm/
```

Build output lands in `wasm/pkg/`. The first build takes a few minutes while Cargo downloads and compiles dependencies; subsequent builds are much faster.

### Verify

```sh
node -e "const w = require('./wasm/pkg/knuth_plass_wasm.js'); console.log(w.hello('world'))"
# → Hello, world!
```

### What happens without the WASM build

If `wasm/pkg/` is absent (or the build fails), `paragraph.ts` catches the load error silently and every `compose()` call uses the TypeScript + opentype.js implementations for font measurement and line breaking. The public API is identical in both paths.

This fallback covers all current features for Latin-script text. It will not cover BiDi/RTL, full OpenType shaping, or the CJS-free bundle path — those require WASM.

To check which path is active at runtime:

```ts
import { wasmStatus } from './src/paragraph.js';

const status = wasmStatus();
// { status: 'loaded' }   — rustybuzz WASM active
// { status: 'absent' }   — WASM not built; TypeScript fallback active
// { status: 'error', error: '...' }  — WASM build exists but failed to load
```

---

## 3. Running the tests

Run the full suite:

```sh
npm test
```

Watch mode (re-runs on file change):

```sh
npm run test:watch
```

Verbose output with individual test names:

```sh
npm test -- --reporter=verbose
```

**Which tests require WASM:**

| Test file | Requires WASM |
|---|---|
| `tests/wasm.test.ts` | Yes — tests Rust function contracts directly |
| `tests/equivalence.test.ts` | Yes — compares TS and Rust output across 200+ paragraphs |
| `tests/binary-debug.test.ts` | Yes — tests binary serialization path |
| All other test files | No — run entirely on the TypeScript path |

If WASM is not built, `wasm.test.ts`, `equivalence.test.ts`, and `binary-debug.test.ts` will report failures or be skipped. All remaining test files pass without WASM.

---

## 4. Testing your own text

Create a file in the repository root (e.g. `try-it.ts`) and run it with `npx tsx`:

```ts
// try-it.ts
import { createParagraphComposer } from './src/paragraph.js';

const registry = new Map([
  [
    'my-font',
    {
      id: 'my-font',
      face: 'Liberation Serif',
      filePath: './fonts/LiberationSerif-Regular.ttf',
    },
  ],
]);

const composer = await createParagraphComposer(registry);

const { lines, lineCount, usedEmergency } = composer.compose({
  text:
    'In olden times when wishing still helped one, there lived a king ' +
    'whose daughters were all beautiful, but the youngest was so beautiful ' +
    'that the sun itself, which has seen so much, was astonished whenever it ' +
    'shone in her face.',
  font: { id: 'my-font', size: 12, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth: 300,
});

console.log(`${lineCount} lines  (emergency stretch: ${usedEmergency})\n`);

for (const line of lines) {
  console.log(line.words.join(' '));
}
```

Run it:

```sh
npx tsx try-it.ts
```

**Swap in your own font** by changing `filePath` to point to any `.ttf` or `.otf` file on your machine. The `fonts/` directory in this repository contains Liberation Serif (regular, bold, italic) and Roboto (regular) for convenience.

### Adjusting composition

Some useful `compose()` options to experiment with:

```ts
composer.compose({
  text: '...',
  font: myFont,
  lineWidth: 300,
  tolerance: 3,           // 2 = default; higher = wider spacing accepted
  emergencyStretch: 20,   // add stretch budget when no solution fits within tolerance
  looseness: 1,           // +1 = one more line than optimal (looser breaks)
  consecutiveHyphenLimit: 2,  // no more than 2 hyphenated lines in a row
  widowPenalty: 1000,     // discourage single-word last lines
});
```

---

## 5. PDF export

The library ships three render helpers: `renderToSvg`, `renderToCanvas`, and `renderToPdf`. All three require a `FontEngine` instance that provides glyph shapes. The default engine is `OpentypeJsEngine`.

### Minimal PDF export

```ts
// export-pdf.ts
import * as fs from 'fs';
import { createParagraphComposer } from './src/paragraph.js';
import { createMeasurer } from './src/measure.js';
import { layoutParagraph, renderToSvg } from './src/render.js';
import { renderToPdf } from './src/pdf.js';
import { OpentypeJsEngine } from './src/engines/opentype-js-engine.js';

const FONT_PATH = './fonts/LiberationSerif-Regular.ttf';
const FONT_ID   = 'serif-regular';
const FONT      = { id: FONT_ID, size: 12, weight: 400, style: 'normal', stretch: 'normal' };

const registry = new Map([
  [FONT_ID, { id: FONT_ID, face: 'Liberation Serif', filePath: FONT_PATH }],
]);

// 1. Compose the paragraph (line breaking + metrics)
const composer  = await createParagraphComposer(registry);
const measurer  = createMeasurer(registry);
const { lines } = composer.compose({
  text: 'The Knuth–Plass algorithm finds the globally optimal set of line breaks ' +
        'for a paragraph, minimising a cost function based on how tightly or loosely ' +
        'each line is fitted to the measure.',
  font: FONT,
  lineWidth: 451,          // roughly A4 with 1-inch margins
});

// 2. Lay out absolute glyph positions
const rendered = layoutParagraph(lines, measurer, { x: 72, y: 72 });

// 3. Load the font engine (used only by the renderer, not the composer)
const fontEngine = new OpentypeJsEngine();
await fontEngine.loadFont(FONT_ID, FONT_PATH);

// 4. Export
const pdfBuf = await renderToPdf(rendered, fontEngine, { width: 595.28, height: 841.89 });
fs.writeFileSync('output.pdf', pdfBuf);
console.log('output.pdf written');

const svgStr = renderToSvg(rendered, fontEngine, { width: 595.28, height: 841.89 });
fs.writeFileSync('output.svg', svgStr, 'utf8');
console.log('output.svg written');
```

Run it:

```sh
mkdir -p output
npx tsx export-pdf.ts
open output.pdf    # macOS / Linux with a PDF viewer
```

### Full demo

`scripts/demo.ts` is a more complete example that renders multiple paragraphs with mixed fonts, inline bold and italic, superscript/subscript, and a narrow column — all to both PDF and SVG:

```sh
npm run demo
# Output: output/demo.pdf  output/demo.svg
open output/demo.pdf
```

---

## Next steps

- **API reference** — [`README.md`](../README.md) covers every `ParagraphInput` option, the full `ComposedLine` output shape, and the language table.
- **Algorithm internals** — [`docs/algorithm.md`](./algorithm.md) maps the Knuth & Plass (1981) paper to the TypeScript source.
- **Architecture** — [`ARCHITECTURE.md`](../ARCHITECTURE.md) describes the six-stage pipeline, the WASM core, and the rendering layer.
- **Changelog** — [`CHANGELOG.md`](../CHANGELOG.md) tracks what changed in each release.
