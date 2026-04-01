# @paragraf/font-engine

Font metrics abstraction + fontkit adapter + measurer factory.
Bridges the layout algorithm (which needs widths and metrics) to real font data.

## Install

```bash
npm install @paragraf/font-engine @paragraf/types
```

## Usage

### Load fonts and create a measurer

```ts
import { createMeasurer, loadFontkitFont } from '@paragraf/font-engine';
import { FontRegistry } from '@paragraf/types';

const registry: FontRegistry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
  ['bold',    { id: 'bold',    face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Bold.ttf' }],
]);

const measurer = await createMeasurer(registry);
// measurer.measure(text, font) → width in points
// measurer.space(font)         → { width, stretch, shrink }
// measurer.metrics(font)       → FontMetrics
```

### `FontkitEngine` — direct access

```ts
import { FontkitEngine } from '@paragraf/font-engine';

const engine = new FontkitEngine();
await loadFontkitFont(engine, descriptor);

const glyphs = engine.glyphsForString('fontId', 'Hello');
const path   = engine.getGlyphPath('fontId', glyph, x, y, fontSize);
const metrics = engine.getFontMetrics('fontId', fontSize);
```

### `FontEngine` interface

Both `FontkitEngine` (TypeScript) and `WasmFontEngine` (`@paragraf/shaping-wasm`) implement this interface:

```ts
interface FontEngine {
  glyphsForString(fontId: string, text: string, font?: Font): Glyph[];
  getFontMetrics(fontId: string, fontSize: number, variant?: FontVariant): FontMetrics;
  getGlyphPath(fontId: string, glyph: Glyph, x: number, y: number, fontSize: number): GlyphPath;
  applyLigatures?(fontId: string, glyphs: Glyph[]): Glyph[];
  applySingleSubstitution?(fontId: string, glyphs: Glyph[], featureTag: string): Glyph[];
  getKerning?(fontId: string, glyph1: Glyph, glyph2: Glyph): number;
}
```

### Test utilities

```ts
import { mockMeasure, mockSpace, mockMetrics } from '@paragraf/font-engine';
```

Same mock functions exported by `@paragraf/linebreak` — use whichever is convenient.
