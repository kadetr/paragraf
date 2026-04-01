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
import { renderToSvg } from '@paragraf/render-core';

const svg = renderToSvg(rendered, { width: 595, height: 842 });
```

### Render to Canvas

```ts
import { renderToCanvas } from '@paragraf/render-core';

renderToCanvas(rendered, ctx); // HTMLCanvasElement 2D context
```

### Document types

```ts
import type { BaselineGrid, Frame, RenderedPage, RenderedDocument } from '@paragraf/render-core';

interface BaselineGrid {
  leading: number;    // line-to-line distance
  capHeight: number;  // cap-height of the primary font at primary size
}

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}
```
