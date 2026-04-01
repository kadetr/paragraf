# @paragraf/linebreak

Knuth-Plass optimum line-breaking algorithm with hyphenation. No font dependencies, no WASM — pure TypeScript, browser-safe.

## Install

```bash
npm install @paragraf/linebreak @paragraf/types
```

## Usage

### High-level: `composeParagraph`

Takes pre-built nodes (boxes, glues, penalties) and returns composed lines.

```ts
import { composeParagraph } from '@paragraf/linebreak';

const lines = composeParagraph(paragraph, measurer);
// lines: ComposedParagraph (array of ComposedLine)
```

### Node building: `buildNodeSequence`

Converts hyphenated words + fonts into the node sequence the algorithm expects.

```ts
import { buildNodeSequence } from '@paragraf/linebreak';

const nodes = buildNodeSequence(hyphenatedWords, measurer);
```

### Hyphenation

```ts
import { loadHyphenator, hyphenateParagraph, loadLanguages } from '@paragraf/linebreak';

// Load a single pattern file
const hyphenate = await loadHyphenator('en-us');
const parts = hyphenate('typesetting'); // → ['type', 'set', 'ting']

// Batch-load multiple languages
await loadLanguages(['en-us', 'de', 'fr']);

// Hyphenate a full word list
const words = ['typesetting', 'algorithm', 'paragraph'];
const hyphenated = await hyphenateParagraph(words, { language: 'en-us' });
```

#### `HyphenateOptions`

```ts
interface HyphenateOptions {
  language?: Language;           // default 'en-us'
  hyphenChar?: string;           // default '\u00AD' (soft hyphen)
  minLeft?: number;              // min chars before first hyphen
  minRight?: number;             // min chars after last hyphen
  minWordLength?: number;        // skip short words
}
```

### Low-level: `computeBreakpoints` + `traceback`

For direct algorithm access:

```ts
import { computeBreakpoints, traceback } from '@paragraf/linebreak';

const breakpoints = computeBreakpoints(paragraph);
if (breakpoints === null) {
  // no feasible solution within tolerance
}
const lines = traceback(breakpoints, paragraph);
```

### Test utilities

```ts
import { mockMeasure, mockSpace, mockMetrics } from '@paragraf/linebreak';

const measurer = {
  measure: mockMeasure,
  space: mockSpace,
  metrics: mockMetrics,
  registry: new Map(),
};
```

## Browser safety

This package has zero Node.js dependencies. It can be imported in
any bundler or browser environment without polyfills.
