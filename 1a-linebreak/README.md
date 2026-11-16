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
  minLeft?: number;               // override the font-size-derived minimum left fragment
  minRight?: number;              // override the font-size-derived minimum right fragment
  processCapitalized?: boolean;   // default: true for 'de', false for every other language
  breakUrls?: boolean;            // default true (since v0.7.1)
  exceptions?: ExceptionDictionary;
}
```

**Capitalised words.** A capitalised word that does not start a sentence is
taken for a proper noun and left whole. German (`de`) is the exception: every
noun is capitalised there, so capitalised words are hyphenated by default
(since v0.7.1), proper names included. An explicit `processCapitalized` always
wins here; `compose()` and `compile()` in the higher packages do not pass it.
Never hyphenated: a word in capitals (no lower-case letter and at least two
upper-case letters, in any script, with or without punctuation: `NATO`,
`(NATO)`, `GRÖSSE`), a word that contains a digit, and an e-mail address (an
`@` between letters or digits).

**URLs** (since v0.7.1). A URL is never hyphenated. It gets break points that
take no hyphen instead:

- after `/`, `?`, `&`, `=`, `#`, `_`, `-` (the last one of a run);
- before a `.` that is followed by a letter or digit;
- never inside `://`, and never leaving fewer than two characters on a side.

Detected as a URL: `http://…`, `https://…`, `ftp://…`, `www.name.tld…`, and a
bare host followed by a slash (`example.com/docs`). A bare host must be in
lower case and its top-level domain must be one of
`com org net edu gov info io dev app eu de uk fr es nl ch ca au jp se dk fi cz br cn`.
Domains that are also common file extensions or abbreviations are left out so
that `Node.js/Express` or `README.md/CHANGELOG.md` are not taken for URLs; write
the scheme or `www.` for other domains. Not detected: a bare host without a
slash, e-mail addresses, file paths. Surrounding punctuation, as in
`(https://example.com/a).`, stays attached and gets no break.

```ts
hyphenateWord('https://example.com/docs/index.html', opts);
// { fragments: ['https://', 'example', '.com/', 'docs/', 'index', '.html'],
//   hyphenable: false, hasSoftHyphen: false, … }
```

`hyphenable: false` with more than one fragment means "break here, add no
hyphen". `buildNodeSequence` then puts a zero-width, unflagged penalty of 200
between the fragments (a hyphenation point is a flagged penalty of 50 with the
width of a hyphen), and `composeParagraph` keeps the fragments in one word.
`composeParagraph` applies that to any unflagged penalty directly after a box,
whatever its value: when the line does not break there, the next box continues
the same word. A `HyphenatedWord` built by hand with several fragments needs
`hyphenable: true` to get hyphens.

Fragments are measured one by one. Letter-spacing is not added between two
fragments and kerning is not applied across them; this holds for hyphenation
points and URL break points alike.
`breakUrls: false` returns a URL as a single fragment, as before v0.7.1.

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
