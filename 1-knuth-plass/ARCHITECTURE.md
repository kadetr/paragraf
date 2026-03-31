# Architecture

This document describes the six-stage pipeline, the node model, the algorithm mechanics, and the key design decisions in this codebase.

---

## Pipeline overview

```
text / TextSpan[]
        │
        ▼
┌───────────────┐
│  hyphenate.ts │  text → HyphenatedWord[] (fragments per word, per language)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    nodes.ts   │  HyphenatedWord[] + Font → Node[] (Box / Glue / Penalty)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ linebreak.ts  │  Node[] → BreakpointResult (optimal line break positions)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ traceback.ts  │  BreakpointNode chain → LineBreak[] (ordered, position + ratio)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  compose.ts   │  Node[] + LineBreak[] → ComposedLine[] (words, spacing, metrics)
└───────┬───────┘
        │
        ▼
  ComposedLine[]   ← hand to renderer, or continue to the built-in rendering layer
        │
        ▼ (optional — via render.ts + FontEngine)
┌───────────────┐
│  render.ts    │  layoutParagraph → RenderedParagraph (absolute glyph positions)
│  pdf.ts       │  renderToSvg / renderToCanvas / renderToPdf
└───────────────┘
```

The high-level façade in `paragraph.ts` orchestrates all stages. Each stage is independently testable — the unit test suite exercises each file in isolation.

---

## Stage 1 — Hyphenation (`hyphenate.ts`)

Input: a raw text string (or extracted word list from `TextSpan[]`).
Output: `HyphenatedWord[]` — one entry per whitespace-delimited word, each with a `fragments` array of hyphenation-point-separated substrings.

```ts
hyphenateWord('beautiful') →
  { original: 'beautiful', fragments: ['beau', 'ti', 'ful'], hyphenable: true, hasSoftHyphen: false }
```

**Soft hyphens.** If the input word contains U+00AD (`\u00AD`), `extractSoftHyphenFragments` uses those positions directly and sets `hasSoftHyphen: true`. These are preferred over algorithmic breaks (`SOFT_HYPHEN_PENALTY = 0` vs `HYPHEN_PENALTY = 50`).

**Skip guards.** Words are not hyphenated if they are shorter than `minWordLength`, contain digits, look like URLs, are all-caps acronyms, or (unless sentence-initial) start with a capital letter.

**Boundary enforcement.** `enforceMinBoundaries` merges short leading or trailing fragments until `fragment.length >= minLeft` and `fragment.length >= minRight`. Both are derived from font size: `max(2, round(fontSize / 6))`.

**Language loading.** Patterns are loaded asynchronously per-language via dynamic `import()` and cached in `hyphenatorCache`. `loadHyphenator(language)` is idempotent.

---

## Stage 2 — Node building (`nodes.ts`)

Input: `HyphenatedWordWithFont[]` (each word with its font and optional `segments` for mixed-font runs).
Output: a flat `Node[]` sequence of `Box`, `Glue`, and `Penalty` nodes — the input representation for the Knuth-Plass algorithm.

### The node model

The Knuth-Plass algorithm operates over three node types from the original paper:

**`Box`** — a fixed-width unit of content. Cannot stretch or shrink.
```ts
{ type: 'box', content: 'beau', font, width: 14.4 }
```

**`Glue`** — a flexible space with a natural `width`, maximum `stretch`, and maximum `shrink`.
```ts
{ type: 'glue', kind: 'word', width: 3.0, stretch: 1.5, shrink: 0.9, font }
```
The `kind` field distinguishes word glue (between words) from the mandatory termination glue (infinite stretch, added at paragraph end). This is an explicit discriminant — no implicit sentinel.

**`Penalty`** — a potential break point with an associated cost. Negative penalty = encouraged break. `FORCED_BREAK` (`-Infinity`) = mandatory break. `PROHIBITED` (`+Infinity`) = no break allowed. `flagged: true` marks hyphen penalties.
```ts
{ type: 'penalty', width: 1.8, penalty: 50, flagged: true }  // hyphen
{ type: 'penalty', width: 0, penalty: -Infinity, flagged: false } // paragraph end
```

### Node sequence for a hyphenated word

The word `"beau-ti-ful"` (with two algorithmic hyphenation points) followed by the word `"day"` produces:

```
Box("beau", w=14.4)
Penalty(w=1.8, p=50, ★)       ← optional break: "beau-"
Box("ti", w=6.8)
Penalty(w=1.8, p=50, ★)       ← optional break: "beau-ti-"
Box("ful", w=11.2)
Glue(w=3.0, +1.5, -0.9)       ← inter-word space
Box("day", w=12.6)
```
★ = `flagged: true`

### Paragraph termination

Every node sequence ends with:
```
Glue(kind='termination', w=0, stretch=+∞, shrink=0)
Penalty(w=0, penalty=-∞, flagged=false)
```

The infinite-stretch termination glue absorbs all remaining space on the last line, ensuring the forced break at the end never produces over-stretched content. The `kind: 'termination'` discriminant lets `compose.ts` skip this glue when assembling output.

### Multi-span words

When `HyphenatedWordWithFont.segments` is present (produced by the `spans` input path), each fragment is itself a `SpanSegment[]`. `buildNodeSequence` emits one `Box` per segment per fragment — consecutive boxes within a word have no glue between them. The hyphen penalty uses the last segment's font for hyphen-width measurement.

### First-line indent

When `firstLineIndent > 0`, a `Box` with `content: ''` (zero-content, non-zero-width) is prepended. It occupies space in the prefix sums and is naturally excluded from widow detection and output word counts by empty-string filtering.

---

## Stage 3 — Line breaking (`linebreak.ts`)

The core Knuth-Plass algorithm. For a complete description of the algorithm mathematics, see [docs/algorithm.md](./docs/algorithm.md).

### Prefix sums

Before the forward pass, cumulative `widths`, `stretches`, and `shrinks` are computed into three arrays of length `nodes.length + 1`. This allows O(1) computation of the sum over any range `[a, b]`:

```ts
sumWidth = sums.widths[b] - sums.widths[a]
```

### Forward pass

The algorithm maintains a list of **active breakpoints** — positions in the node sequence that could be the start of the current line. For each valid break position `i`, it evaluates every active breakpoint `a` as a candidate start:

1. Compute the **ratio** `r` — how much the glue between `a` and `i` must stretch or shrink to fill `lineWidth`
2. Check **feasibility**: `r ∈ [-1, tolerance]`
3. Compute **demerits** for the `(a → i)` line
4. Keep the best candidate per line count (for looseness support)
5. Prune active breakpoints where `r < -1` (line is too full to ever improve)

**Per-line widths.** When `lineWidths[]` is provided, each candidate uses `lineWidths[a.line] ?? lineWidth` as its target width, where `a.line` is the 0-based index (`lineWidths[0]` = line 1 width).

### Demerits

```
badness = round(100 × |r|³)

if penalty ≥ 0:    demerits = (1 + badness + penalty)²
if penalty < 0
    (not forced):  demerits = (1 + badness)² − penalty²
if forced break:   demerits = (1 + badness)²

if prevFlagged and currFlagged: demerits += DOUBLE_HYPHEN_PENALTY (3000)
```

These formulas are faithful to TeX. See [docs/algorithm.md](./docs/algorithm.md) §4.

### Extensions

- **`widowPenalty`** — added to demerits at the forced break if the last line has exactly one content box
- **`orphanPenalty`** — added at the forced break if `a.previous === null` (single-line paragraph)
- **`consecutiveHyphenLimit`** — candidates exceeding the limit are skipped (`continue`) rather than penalised
- **Emergency stretch** — if the active list is empty after the first pass, a second pass runs with `emergencyStretch` added to all glue stretch budgets; `usedEmergency` is set `true`
- **Looseness** — after finding the optimal solution, the algorithm selects the best candidate with `line = optimal.line + looseness`; falls back to optimal if the target line count is unreachable

### Output: `BreakpointResult`

```ts
interface BreakpointResult {
  node:          BreakpointNode; // tail of the optimal linked list
  usedEmergency: boolean;
}
```

---

## Stage 4 — Traceback (`traceback.ts`)

Follows the `previous` pointer chain from the final `BreakpointNode` back to the start node, collecting `{ position, ratio, flagged, line }` at each step. Reverses the collected array to produce `LineBreak[]` in paragraph order.

This is a simple linked-list walk — O(lineCount).

---

## Stage 5 — Composition (`compose.ts`)

Input: the original `Node[]` and `LineBreak[]`.
Output: `ComposedLine[]`.

For each `LineBreak`, `extractLine` walks the node range `(previousPosition, position]`:

- **Box nodes** are assembled into words. Consecutive boxes with no intervening glue or penalty are treated as span continuations (same word, different font run) and concatenated in both `words[]` and `wordRuns[]`. Boxes following a flagged penalty (hyphen) are also concatenated into the previous word.
- **Glue nodes** (`kind: 'word'`) resolve `wordSpacing` from the first glue encountered, applying `ratio × stretch` (if `ratio ≥ 0`) or `ratio × shrink` (if `ratio < 0`) for justified alignment; natural width for all other modes.
- **Penalty nodes** set `lastWasHyphenPenalty` when inside the line (not at the break position).

After assembly, if `flagged` (line ends with a hyphen), `'-'` is appended to the last word string and to the last segment of `wordRuns[last]`.

**`lineHeight` and `baseline`** are computed from `getMetrics(fonts[0])` — the OS/2 metrics of the line's first font. Both fields are `0` when no `getMetrics` function is provided (e.g. in direct test calls).

**`justifyLastLine`** — the break node for the last line carries `ratio = 0` (absorbed by the termination glue). When `justifyLastLine = true`, `computeLastLineRatio` recomputes the real ratio by scanning the last line's content width against `lineWidth`.

**`isWidow`** — set in a post-pass after all lines are assembled. The last line is marked a widow if `words.filter(w => w !== '').length === 1` and there are at least two lines. (`widowPenalty` during line breaking makes this outcome costly but not impossible.)

---

## Stage 6 — Paragraph façade (`paragraph.ts`)

`createParagraphComposer` is the only entry point most consumers need. It:

1. Loads en-us hyphenation patterns on construction
2. Creates a `Measurer` bound to the provided `FontRegistry`
3. Tracks loaded languages in a `Set<Language>` for runtime validation
4. Exposes `compose(input)` (synchronous) and `ensureLanguage(language)` (async)

**Span processing.** When `input.spans` is provided, `spansToWords` splits each span's text at whitespace, assigns per-character font ownership, and produces per-word `SpanSegment[]`. It then calls `hyphenateWord` on the concatenated word text and uses `mapFragmentsToSegments` to distribute hyphenation fragment boundaries back across the source spans.

---

## Rendering layer (`render.ts`, `pdf.ts`, `src/font-engine.ts`)

The rendering layer is **optional and font-engine-agnostic**. It sits downstream of `ComposedLine[]` and converts composition output into glyph-level output via any `FontEngine` implementation.

### FontEngine interface (`src/font-engine.ts`)

`FontEngine` is the abstraction boundary between the rendering layer and the font library:

```ts
interface FontEngine {
  loadFont(id: string, path: string): Promise<void>;
  glyphsForString(fontId: string, text: string): Glyph[];
  applyLigatures(fontId: string, glyphs: Glyph[]): Glyph[];
  applySingleSubstitution(fontId: string, glyphs: Glyph[], featureTag: 'sups' | 'subs'): Glyph[];
  getKerning(fontId: string, glyph1: Glyph, glyph2: Glyph): number;
  getGlyphPath(fontId: string, glyph: Glyph, x: number, y: number, fontSize: number): GlyphPath;
  getFontMetrics(fontId: string, fontSize: number, variant?: 'normal' | 'superscript' | 'subscript'): FontMetrics;
}
```

`OpentypeJsEngine` (`src/engines/opentype-js-engine.ts`) is the default implementation. It lazy-loads `opentype.js` via `createRequire` only when the engine is first instantiated — bundlers can tree-shake it entirely when a different engine is supplied.

### Layout pass (`layoutParagraph`)

```ts
layoutParagraph(composed: ComposedParagraph, measurer: Measurer, origin: Point): RenderedParagraph
```

Converts `ComposedLine[]` into `RenderedLine[]` — a flat list of `PositionedSegment { text, font, x, y }` with absolute page coordinates. The `y` coordinate is `baseline ± verticalOffset` (positive `verticalOffset` = above baseline).

### Render functions

| Function | Output |
|---|---|
| `renderToSvg(rendered, fontEngine, viewport)` | SVG string — one `<path>` per glyph |
| `renderToCanvas(rendered, fontEngine, ctx)` | Draws to an existing `CanvasRenderingContext2D` |
| `renderToPdf(rendered, fontEngine, opts?)` | `Promise<Buffer>` — PDFKit-based PDF with glyph outline paths |

All three apply the same GSUB pipeline: `glyphsForString` → `applyLigatures` → `applySingleSubstitution` (if `font.variant` is set) → per-glyph path generation. Glyph geometry is not embedded text — content is not text-searchable.

### Pluggability

Users can supply any `FontEngine` implementation without modifying the rendering layer:

```ts
// Default: opentype.js
const svgOutput = renderToSvg(rendered, new OpentypeJsEngine(), viewport);

// Future: custom WASM engine
const svgOutput = renderToSvg(rendered, new HarfBuzzWasmEngine(), viewport);

// Any: browser font API, Skia, custom source
const svgOutput = renderToSvg(rendered, new BrowserFontEngine(), viewport);
```

---

## Design decisions

### `Glue.kind: 'word' | 'termination'`

Earlier versions used the presence of `font?: Font` as an implicit sentinel to distinguish word glue from termination glue. That created cross-file coupling — `compose.ts` needed to know that termination glue was identified by the absence of a `font` field. An explicit `kind` discriminant makes the contract visible in the type system and enforced at the builder site (`nodes.ts:buildTermination`).

### OS/2 space metrics instead of width-proportional heuristics

Word stretch and shrink use TeX's typographic conventions: `stretch = em/6`, `shrink = em/9` — computed from the font's em size, not scaled from space width. This means two fonts with the same space glyph width but different em sizes will have different stretch/shrink values, which is typographically correct. The em size fallback (`font.size`) is always available even when the OS/2 table is absent.

### `lineWidths[i]` is 0-indexed, where index `i` = line `i+1`

`lineWidths[0]` is the width of the first line, `lineWidths[1]` the second, and so on. This is a 0-based convention that mirrors the natural 0-based indices in the `breaks[]` array in `composeParagraph`. The `forwardPass` uses `lineWidths[a.line]` where `a.line` is the active node's line count — also 0-based — which maps correctly. This is documented on `ParagraphInput.lineWidths` because it is a common source of misconfiguration.

### Emergency stretch owned by `linebreak.ts`, not `paragraph.ts`

`computeBreakpoints` handles both passes internally and returns `{ node, usedEmergency }`. This keeps the paragraph façade free of retry logic and prevents the caller from accidentally invoking a redundant pass. In earlier versions, `paragraph.ts` managed the two-pass logic via try/catch, resulting in the no-emergency forward pass running twice when emergency stretch was needed.

### `SOFT_HYPHEN_PENALTY = 0`

A soft hyphen break costs only the line's badness — no additional penalty from the break point itself. This matches TeX's `\discretionary{}{}{}` with penalty 0: the algorithm will break at a soft hyphen only when the line ratio would be poor anyway. `HYPHEN_PENALTY = 50` makes algorithmic hyphenation more expensive, so soft hyphens are preferred when both options are available for the same word.

---

## WASM Rust core (`wasm/`)

The library ships a Rust/WASM port of the three performance-critical subsystems: glyph measurement, the Knuth-Plass forward pass, and traceback. The WASM core is compiled with `wasm-pack --target nodejs` and loaded at module-initialisation time by the `paragraph.ts` façade via the same `createRequire` CJS shim used by opentype.js.

### Implementation roadmap (Phases 0–7)

**Phase 0–1 : Data types & round-trip validation**
- Rust port of `Font`, `Node` (Box/Glue/Penalty), `ParagraphInput`, and `LineBreak` types
- JSON-based serialization (`serde_json`) for boundary validation — proves TypeScript ↔ Rust contracts
- `round_trip_node`, `round_trip_paragraph` functions test schema compatibility

**Phase 2 : Forward pass & line breaking**
- Full Rust port of `computeBreakpoints`, prefix sums, ratio computation, badness, demerits
- Multi-pass tolerance ladder (tight → loose → emergency) matching TypeScript exactly
- Arena allocator for BreakpointNode using `Vec<T>` with `Option<usize>` previous pointers

**Phase 3 : Traceback**
- Rust traceback returns ordered `LineBreak[]` across WASM boundary
- Includes `position`, `ratio`, `flagged`, `line`, `usedEmergency` — all fields needed by `ComposedLine`

**Phase 4 : Font metrics via rustybuzz**
- `register_font(id, bytes)` — stores font bytes in a thread-local cache
- `measure_text_wasm(text, font)` — rustybuzz shaping with GSUB (liga/rlig/sups/subs) + advance width sum
- `space_metrics_wasm(font)` — raw hmtx advance for space (no shaping) + TeX-convention stretch/shrink
- `font_metrics_wasm(font)` — OS/2 ascender/descender with hhea fallback, x-height/cap-height with fallbacks, baselineShift for sups/subs
- Cross-library tolerance: `0.025 pt/glyph` for opentype.js ↔ rustybuzz measurement differences

**Phase 4.5 : Binary packaging**
- WASM binary bundled in npm package via `package.json` `files` field
- Synchronous CJS load via `createRequire` + internal `readFileSync`; no async ceremony
- Works offline; no network dependency at startup

**Phase 5 : TypeScript integration**
- `paragraph.ts` loads WASM module at scope initialization; `null` if unavailable
- JSON serialization (`toWasmJson`) bridges ±Infinity to finite sentinels (-1e30 / 1e30)
- Transparent fallback to TypeScript implementations when WASM absent
- All 385 tests pass with WASM active

**Phase 6 : Equivalence validation**
- 200+ paragraph corpus (short / medium / long / very-long texts; English / German / Finnish)
- 11 test cases: algorithm equivalence (TS nodes, TS KP vs Rust KP), per-word width tolerance, end-to-end equivalence
- Break positions exact match; ratio match within 1e-6 (floating-point precision)
- Measurement divergence tolerance: 0.025 pt/glyph (cross-library differences on non-ASCII)

**Phase 7 : Performance benchmarks**
- 6 workloads: short para (1×1000), long para (1×100), multi-column (varied lineWidths), catalog (1000×), cold startup (init time), memory ceiling (815 nodes)
- Baseline measurements with JSON path (Phase 1)
- WASM JSON path currently 0.6–1.0× TypeScript (JSON overhead dominates)
- Binary optimization framework in place (`src/wasm-binary.ts`, `traceback_wasm_binary()`) — active in production (Phase 8 complete)

**Phase 8 : Binary serialization (complete)**
- `src/wasm-binary.ts` and `traceback_wasm_binary()` active in the production path
- `±Infinity` sentinel conversion (`→ ±1e30`) in `serializeNodesToBinary` matches `toWasmJson` behaviour, preventing `∞ − ∞ = NaN` in Rust prefix-sum subtraction
- `lineWidths` parameter added to binary path; `traceback_wasm_binary` receives a `Float64Array` slice
- Production (`paragraph.ts`) uses `tracebackWasmBinary` (binary path)
- Expected gain: 50–70% reduction in serialization overhead (Float64Array + Uint8Array vs JSON.stringify)
- Precondition: JSON and binary paths must produce bit-identical results across the full equivalence corpus before binary path is enabled

### Distribution strategy — bundled in npm package

The compiled artifacts (`wasm/pkg/knuth_plass_wasm.js` and `wasm/pkg/knuth_plass_wasm_bg.wasm`) are listed in the `files` field of `package.json` and shipped as part of the npm package. This is the recommended strategy for v1:

- **Works offline** — no network access required at startup
- **Synchronous load in Node.js** — wasm-pack's CJS output calls `fs.readFileSync` internally to load the `.wasm` binary; no async initialisation ceremony needed
- **Single artifact** — consumers install the package and get the WASM binary for free; no separate build step

The ~200–500 KB binary size overhead is acceptable for a typography library.

### Loading path

```ts
// paragraph.ts (module scope)
let _wasm: any = null;
let _wasmError: string | null = null;
try {
  const _require = createRequire(import.meta.url);
  _wasm = _require('../wasm/pkg/knuth_plass_wasm.js');
} catch (e) {
  _wasmError = String(e); // preserved for wasmStatus() diagnostic
}

// Diagnostic helper — distinguishes clean fallback from misconfigured build
export function wasmStatus(): { status: 'loaded' | 'absent' | 'error'; error?: string } { ... }
```

If the WASM package is absent (e.g. the user cloned the repo without running `wasm-pack build`), `_wasm` stays `null` and every `compose()` call falls back transparently to the TypeScript implementations.

### Fallback behaviour

| Condition | Font measurement | Line breaking |
|-----------|-----------------|---------------|
| WASM loaded | `measure_text_wasm` / `space_metrics_wasm` / `font_metrics_wasm` via rustybuzz | `tracebackWasmBinary` (binary path — Float64Array + Uint8Array) |
| WASM absent | opentype.js `realMeasure` / `realSpace` / `realMetrics` | TypeScript `computeBreakpoints` + `traceback` |

The public API (`createParagraphComposer`, `compose`) is identical in both paths. The `usedEmergency` flag is returned from the Rust core as part of the `tracebackWasmBinary` response.

### Binary serialization path (Phase 8 — active)

`src/wasm-binary.ts` eliminates JSON serialization overhead at the WASM boundary:
- **Float64Array**: 4 f64 values per node (width, param1, param2, param3)
- **Uint8Array**: Type code + flags per node (type in lower 4 bits, flags in upper 4 bits)
- **Sentinel conversion**: `±Infinity → ±1e30` prevents `∞ − ∞ = NaN` in Rust prefix-sum subtraction
- **`lineWidths` support**: per-line widths passed as a separate `Float64Array` slice

---

## Known Limitations

### Mixed-font word spacing approximation

`compose.ts` resolves word spacing from the **first word glue on each line**:

```ts
// NOTE: word spacing is resolved from the first word glue on the line.
// For mixed-font paragraphs this is an approximation.
const wordSpacing = firstGlue.width * ratio + firstGlue.width;
```

If a line opens with a small-font word followed by large-font words, all inter-word
spacing on that line uses the small-font glue width. This is correct for single-font
paragraphs (the common case) and a minor approximation for mixed-font runs where the
first span happens to be the smallest font on the line.

**Correct fix (v0.6):** Thread individual glue widths through `ComposedLine` — resolve
each glue node independently using its own `font` field, rather than a single
`wordSpacing` scalar. This requires changing `ComposedLine.wordSpacing: number` to
`ComposedLine.glueWidths: number[]` and updating `compose.ts`, `render.ts`, and
`layoutParagraph` accordingly.

