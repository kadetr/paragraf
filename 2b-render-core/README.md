# @paragraf/render-core

Layout and rendering primitives for paragraf. Converts composed paragraphs
into positioned segments, SVG strings, or Canvas draw calls.

Browser-safe — no Node.js dependencies.

## Install

```bash
npm install @paragraf/render-core @paragraf/font-engine @paragraf/types
```

## Usage

### Layout a paragraph

```ts
import { layoutParagraph } from '@paragraf/render-core';
import { createMeasurer }  from '@paragraf/font-engine';
import { FontRegistry }    from '@paragraf/types';

const registry: FontRegistry = new Map([
  ['regular', { id: 'regular', face: 'SourceSerif4', filePath: './fonts/SourceSerif4-Regular.ttf' }],
]);

const measurer = createMeasurer(registry);
const rendered = layoutParagraph(composedParagraph, measurer, { x: 72, y: 72 });
// rendered: RenderedParagraph — array of RenderedLine
```

Each `RenderedLine` contains:

```ts
interface RenderedLine {
  segments: PositionedSegment[]; // per-font text runs with absolute x/y
  baseline: number;              // absolute y of baseline on page
  lineHeight: number;
}

interface PositionedSegment {
  text: string;
  font: Font;
  x: number;
  y: number; // baseline minus verticalOffset
}
```

### Render to SVG

```ts
import { FontkitEngine } from '@paragraf/font-engine';
import { renderToSvg }   from '@paragraf/render-core';

const fontEngine = new FontkitEngine();
await fontEngine.loadFont('regular', './fonts/SourceSerif4-Regular.ttf');

const svg = renderToSvg(rendered, fontEngine, { width: 595, height: 842 });
```

### Render to Canvas

```ts
import { renderToCanvas } from '@paragraf/render-core';

// fontEngine created as above; reuse across render calls
renderToCanvas(rendered, fontEngine, ctx); // HTMLCanvasElement 2D context
```

### Document types

```ts
import type { BaselineGrid, Frame, RenderedPage, RenderedDocument } from '@paragraf/render-core';

interface BaselineGrid {
  first: number;             // offset from frame.y to first grid line in points
  interval: number;          // distance between grid lines in points
}

interface Frame {
  page: number;               // 0-based page index
  x: number;
  y: number;
  width: number;
  height: number;
  columnCount?: number;       // default 1
  gutter?: number;            // inter-column gap in points; default 0
  grid?: BaselineGrid;
  paragraphSpacing?: number;  // space below each paragraph; default 0
}
```
