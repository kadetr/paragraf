# @paragraf/types

Shared interfaces, type aliases, and constants for the paragraf typesetting pipeline.

Zero runtime code — types only. Every other `@paragraf/*` package depends on this one.

## Install

```bash
npm install @paragraf/types
```

## What's in here

### Font

```ts
interface Font {
  id: FontId;        // registered font identifier
  size: number;      // point size
  weight: number;    // e.g. 400 = regular, 700 = bold
  style: FontStyle;  // 'normal' | 'italic' | 'oblique'
  stretch: FontStretch;
  letterSpacing?: number; // extra tracking (same unit as size)
  variant?: FontVariant;  // 'normal' | 'superscript' | 'subscript'
}

interface FontDescriptor {
  id: FontId;
  face: string;   // PostScript or family name used by the font engine
  filePath: string;
}

type FontRegistry = Map<FontId, FontDescriptor>;
```

### FontMetrics

OS/2 table values scaled to `font.size`:

```ts
interface FontMetrics {
  unitsPerEm: number;
  ascender: number;    // sTypoAscender
  descender: number;   // sTypoDescender (negative)
  xHeight: number;
  capHeight: number;
  lineGap: number;
  baselineShift: number; // >0 raise (sup), <0 lower (sub), 0 normal
}
```

### Text content

```ts
interface TextSpan {
  text: string;
  font: Font;
  verticalOffset?: number; // positive = above baseline
}

interface SpanSegment {
  text: string;
  font: Font;
  verticalOffset?: number;
}
```

### Paragraph nodes

The Knuth-Plass algorithm operates on a sequence of boxes, glues, and penalties:

```ts
interface Box     { type: 'box';     width: number; content: string; font: Font; }
interface Glue    { type: 'glue';    width: number; stretch: number; shrink: number; kind: 'word' | 'termination'; }
interface Penalty { type: 'penalty'; width: number; penalty: number; flagged: boolean; }

type Node = Box | Glue | Penalty;
```

### Paragraph I/O

```ts
interface Paragraph {
  nodes: Node[];
  lineWidth: number;
  lineWidths?: number[];
  tolerance: number;
  alignment?: AlignmentMode; // 'justified' | 'left' | 'right' | 'center'
  // ... full options in type definition
}

interface ComposedLine {
  words: string[];
  fonts: Font[];
  wordRuns: SpanSegment[][];
  wordSpacing: number;
  hyphenated: boolean;
  ratio: number;
  alignment: AlignmentMode;
  lineWidth: number;
  lineHeight: number;
  baseline: number;
  direction?: 'ltr' | 'rtl';
  xOffset?: number; // optical margin alignment shift
}

type ComposedParagraph = ComposedLine[];
```

### Constants

```ts
const FORCED_BREAK      = -Infinity; // mandatory line break
const PROHIBITED        = +Infinity; // no break allowed
const HYPHEN_PENALTY    = 50;
const DOUBLE_HYPHEN_PENALTY = 3000;
const SOFT_HYPHEN_PENALTY   = 0;
```

### Measurer interface

```ts
interface Measurer {
  measure: (content: string, font: Font) => number;
  space:   (font: Font) => GlueSpaceMetrics;
  metrics: (font: Font) => FontMetrics;
  registry: FontRegistry;
}
```

## Language support

`Language` covers 22 locales for hyphenation:
`en-us`, `en-gb`, `de`, `fr`, `tr`, `nl`, `pl`, `it`, `es`, `sv`, `no`, `da`,
`fi`, `hu`, `cs`, `sk`, `ro`, `hr`, `sl`, `lt`, `lv`, `et`.
