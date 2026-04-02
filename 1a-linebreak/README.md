# @paragraf/linebreak

Knuth-Plass optimum line-breaking algorithm with hyphenation. No font dependencies, no WASM — pure TypeScript, browser-safe.

## Install

```bash
npm install @paragraf/linebreak @paragraf/types
```

## Usage

### `computeBreakpoints` + `traceback` + `composeParagraph`

Build a node sequence, find breakpoints, then assemble composed lines:

```ts
import { computeBreakpoints, traceback, composeParagraph } from '@paragraf/linebreak';

const result = computeBreakpoints(paragraph);
// throws if no solution; result.usedEmergency is true if emergencyStretch was needed
const breaks = traceback(result.node);
const lines  = composeParagraph(nodes, breaks, 'justified', false, lineWidth, [], getMetrics);
```

### Node building: `buildNodeSequence`

Converts hyphenated words + fonts into the node sequence the algorithm expects.

```ts
import { buildNodeSequence } from '@paragraf/linebreak';

const nodes = buildNodeSequence(hyphenatedWords, measurer);
```

### Hyphenation

```ts
import { loadHyphenator, hyphenateWord, hyphenateParagraph, loadLanguages } from '@paragraf/linebreak';

// Load patterns for a language (must call before hyphenating)
await loadHyphenator('en-us');
// patterns loaded — use hyphenateWord / hyphenateParagraph from this point on
const words = hyphenateParagraph(text, { language: 'en-us', minWordLength: 5, fontSize: 12 });

// Batch-load multiple languages
await loadLanguages(['en-us', 'de', 'fr']);
```

#### `HyphenateOptions`

```ts
interface HyphenateOptions {
  minWordLength: number;          // required — skip words shorter than this
  fontSize: number;               // required — drives minLeft/minRight derivation
  language: Language;             // required
  preserveSoftHyphens?: boolean;  // default true
}
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
