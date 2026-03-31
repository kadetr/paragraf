# knuth-plass

A TypeScript implementation of the Knuth-Plass paragraph composition algorithm. Takes text and font metrics, applies optimal line breaking, and returns a structured `ComposedParagraph` ready for any renderer.

---

## What it is

A **paragraph composer**, not a renderer. It decides *where* lines break and *how much space* goes between words. It does not draw text, produce SVG, or generate PDF — that is the renderer's job.

## What it is not

- A layout engine — it composes paragraphs, not full pages or frames
- A BiDi / RTL engine — Latin-script only until HarfBuzz integration (see [Roadmap](#roadmap))
- A CSS text layout replacement

---

## Install

```sh
npm install knuth-plass
```

### Requirements

Node 18+, TypeScript 5.x. The default font engine (`OpentypeJsEngine`) loads `opentype.js` lazily via a CJS compatibility shim. The font-engine layer is abstracted — any `FontEngine` implementation can be substituted at render time.

---

## Quick start

```ts
import { createParagraphComposer } from 'knuth-plass';
import type { FontRegistry } from 'knuth-plass';

// 1. Register fonts
const registry: FontRegistry = new Map([
  [
    'serif-regular',
    {
      id: 'serif-regular',
      face: 'Liberation Serif',
      filePath: './fonts/LiberationSerif-Regular.ttf',
    },
  ],
]);

// 2. Create the composer (loads en-us hyphenation patterns)
const composer = await createParagraphComposer(registry);

// 3. Compose a paragraph
const { lines, lineCount, usedEmergency } = composer.compose({
  text: 'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful.',
  font: { id: 'serif-regular', size: 12, weight: 400, style: 'normal', stretch: 'normal' },
  lineWidth: 200,
});

// 4. Render (your renderer here)
let y = 0;
for (const line of lines) {
  let x = 0;
  for (let i = 0; i < line.words.length; i++) {
    drawText(line.words[i], x, y + line.baseline, line.fonts[i]);
    x += wordWidth(line.words[i], line.fonts[i]) + line.wordSpacing;
  }
  y += line.lineHeight;
}
```

### Mixed-font input (`TextSpan[]`)

```ts
const { lines } = composer.compose({
  spans: [
    { text: 'The quick ', font: regularFont },
    { text: 'brown fox', font: italicFont },
    { text: ' jumped over the lazy dog.', font: regularFont },
  ],
  font: regularFont, // fallback / measurement base
  lineWidth: 200,
});

// line.wordRuns[i] gives per-span detail for mixed-font words
```

### Additional languages

```ts
await composer.ensureLanguage('de');

const { lines } = composer.compose({
  text: 'Internationalisierung und Lokalisierung',
  font: myFont,
  lineWidth: 200,
  language: 'de',
});
```

---

## Output — `ComposedLine`

Every element of `lines` is a `ComposedLine`. A renderer needs these fields:

| Field | Type | Description |
|---|---|---|
| `words` | `string[]` | Words on the line; last word includes `'-'` if `hyphenated` |
| `fonts` | `Font[]` | Parallel to `words` — font for each word entry |
| `wordRuns` | `SpanSegment[][]` | Per-word span detail for mixed-font words |
| `wordSpacing` | `number` | Space between words in output units (e.g. pt) |
| `lineWidth` | `number` | Effective line width for this line |
| `lineHeight` | `number` | `ascender − descender + lineGap` from OS/2 table |
| `baseline` | `number` | Ascender (OS/2), relative to line top — use as y-offset for `fillText` |
| `alignment` | `AlignmentMode` | `'justified' \| 'left' \| 'right' \| 'center'` |
| `hyphenated` | `boolean` | Whether the line ends with a hyphen |
| `ratio` | `number` | Glue adjustment ratio (`r` in K-P); `0` = natural spacing |
| `isWidow` | `boolean` | `true` if this is a single-word last line |

---

## API

### `createParagraphComposer(registry)`

```ts
const composer = await createParagraphComposer(registry: FontRegistry): Promise<ParagraphComposer>
```

Loads English (en-us) hyphenation patterns. Returns a `ParagraphComposer` with two methods.

### `composer.compose(input)`

```ts
composer.compose(input: ParagraphInput): ParagraphOutput
```

Synchronous after construction. Throws if the requested `language` has not been loaded via `ensureLanguage`.

**`ParagraphInput`** — key options:

| Option | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | — | Plain text input (mutually exclusive with `spans`) |
| `spans` | `TextSpan[]` | — | Rich input with per-run fonts (mutually exclusive with `text`) |
| `font` | `Font` | — | Default/base font |
| `lineWidth` | `number` | — | Line width in output units |
| `lineWidths` | `number[]` | `[]` | Per-line widths; `lineWidths[i]` = width of line `i+1` |
| `tolerance` | `number` | `2` | Max acceptable glue ratio; increase to allow looser lines |
| `emergencyStretch` | `number` | `0` | Extra stretch budget for paragraphs that can't be set within tolerance |
| `alignment` | `AlignmentMode` | `'justified'` | |
| `language` | `Language` | `'en-us'` | Hyphenation language |
| `looseness` | `number` | `0` | `+1` = one more line than optimal, `-1` = one fewer |
| `justifyLastLine` | `boolean` | `false` | Justify the last line (full justification) |
| `firstLineIndent` | `number` | `0` | First-line indent width |
| `consecutiveHyphenLimit` | `number` | `0` | Max consecutive hyphenated lines; `0` = unlimited |
| `widowPenalty` | `number` | `0` | Extra demerits for a single-word last line |
| `orphanPenalty` | `number` | `0` | Extra demerits for a single-line paragraph |
| `preserveSoftHyphens` | `boolean` | `true` | Honour U+00AD soft hyphens in input text |
| `fontPerWord` | `(i, word) => Font` | — | Per-word font override (ignored when `spans` is used) |

**`ParagraphOutput`**:

```ts
interface ParagraphOutput {
  lines:          ComposedParagraph; // ComposedLine[]
  lineCount:      number;
  usedEmergency:  boolean;           // true if emergencyStretch was needed
}
```

### `composer.ensureLanguage(language)`

```ts
await composer.ensureLanguage('de');
```

Loads hyphenation patterns for the given language. Idempotent — safe to call multiple times.

---

## Supported languages

| Code | Language | Code | Language |
|---|---|---|---|
| `en-us` | English (US) | `sv` | Swedish |
| `en-gb` | English (GB) | `no` | Norwegian |
| `de` | German | `da` | Danish |
| `fr` | French | `fi` | Finnish |
| `tr` | Turkish | `hu` | Hungarian |
| `nl` | Dutch | `cs` | Czech |
| `pl` | Polish | `sk` | Slovak |
| `it` | Italian | `ro` | Romanian |
| `es` | Spanish | `hr` | Croatian |
| `lt` | Lithuanian | `sl` | Slovenian |
| `lv` | Latvian | `et` | Estonian |

---

## Scope and limitations

**Latin-script only.** BiDi (Arabic, Hebrew, Persian, Urdu) requires the Unicode Bidirectional Algorithm (UAX#9) and contextual substitution via HarfBuzz, which are not yet integrated. Until then, this library should be described as a Latin-script paragraph composer.

**Limited GSUB.** OpenType ligature substitution (`liga`, `rlig`) and single substitution (`sups`, `subs`) are supported via rustybuzz. Contextual substitution (complex scripts) and other advanced features are not yet integrated.

**WASM font backend.** Font measurement defaults to rustybuzz via WASM (Phase 4–5, complete). Fallback to opentype.js is automatic when WASM is unavailable. Initialization cost: ~2.4ms on cold startup. Call `wasmStatus()` to distinguish a clean fallback from a misconfigured WASM build.

**API unstable at v0.x.** Breaking changes may occur in minor versions. Stability is committed at v1.0.0.

---

## Roadmap

| Version | Milestone | Status |
|---|---|---|
| **v0.2** | **Multi-column layout** (per-line `lineWidths`) | ✅ **DONE** |
| **v0.3** | **Rendering examples** (canvas, SVG, PDFKit) | ✅ **DONE** |
| **v0.4** | **WASM font backend** (rustybuzz, GSUB ligatures/sups/subs) | ✅ **DONE** |
| **v0.5** | **Font-engine-agnostic rendering** (`FontEngine` abstraction, `OpentypeJsEngine`) | ✅ **DONE** |
| v0.6 | **Stabilize rustybuzz WASM path** — primary shaping engine, GSUB/GPOS production-ready | Next |
| v0.7 | **HarfBuzzWasmEngine** — full OpenType rendering engine (stylistic sets, small caps, BiDi) | Polish |
| v1.0 | **API stability** — production-ready, full documentation | Final release |

### v0.5 — Font-Engine-Agnostic Architecture (DONE)

Rendering is now decoupled from any specific font library via the `FontEngine` interface. `OpentypeJsEngine` is the default implementation. Users can supply any engine — fontkit, HarfBuzz WASM, or custom — without modifying the rendering layer.

### v0.6–0.7 — WASM / HarfBuzz Shaping

Both build on the rustybuzz WASM core (Phase 4–5):

- **v0.6 (WASM stabilization)**: Production-harden the rustybuzz measurement + shaping path. GSUB/GPOS coverage, performance benchmarks against opentype.js fallback.
- **v0.7 (HarfBuzzWasmEngine)**: Full OpenType rendering engine — stylistic sets, small caps, old-style figures, BiDi/RTL contextual substitution (UAX#9).

### Browser / DOM Implementation

Separate product. Targets web developers. Build **after** core library gains traction (WASM makes this practical).

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full description of the six-stage pipeline, node model, and algorithm. See [docs/algorithm.md](./docs/algorithm.md) for a mapping from the Knuth & Plass 1981 paper to this codebase.

---

## References

- Knuth, D.E. & Plass, M.F. (1981). *Breaking Paragraphs into Lines*. Software: Practice and Experience, 11(11), 1119–1184.
- Knuth, D.E. (1984). *The TeXbook*, Chapter 14: How TeX Breaks Paragraphs into Lines.
- OpenType Specification — [OS/2 table](https://learn.microsoft.com/en-us/typography/opentype/spec/os2) (`sTypoAscender`, `sTypoDescender`, `sTypoLineGap`).
- Unicode Standard Annex #9 — [The Bidirectional Algorithm](https://www.unicode.org/reports/tr9/) (cited as known gap).
- [hyphen](https://github.com/nicktindall/hyphen) — TeX-derived hyphenation patterns for 22 languages.

---

## License

MIT
