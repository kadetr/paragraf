# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the following convention:

> **v0.x releases may contain breaking API changes in minor versions.**
> Stability is committed at v1.0.0.

---

## [Unreleased]

### Added

**Font-engine-agnostic rendering** (v0.5)
- `FontEngine` interface (`src/font-engine.ts`) — abstraction boundary for any font library; decouples rendering from opentype.js
- `OpentypeJsEngine` (`src/engines/opentype-js-engine.ts`) — default implementation; lazy-loads `opentype.js` via `createRequire` only when the engine is instantiated
- `getFontMetrics(fontId, fontSize, variant?)` — optional `variant` parameter; returns correct `baselineShift` for superscript/subscript using OS/2 `ySuperscriptYOffset`/`ySubscriptYOffset`
- `renderToSvg`, `renderToCanvas`, `renderToPdf` — all three renderers now accept a `FontEngine` parameter; font-library independent
- `layoutParagraph` → `RenderedParagraph` — geometry pass producing absolute `PositionedSegment { text, font, x, y }` coordinates
- `wasmStatus()` — diagnostic export from `paragraph.ts`; returns `{ status: 'loaded' | 'absent' | 'error', error? }` to distinguish graceful fallback from misconfigured build

**WASM Rust core (Phase 4–7)** — Integrated rustybuzz-powered font measurement and line breaking
- **Phase 4**: Rust implementation of font measurement via rustybuzz (GSUB ligatures, single substitution for superscript/subscript, advance width, kerning)
- **Phase 5**: TypeScript integration — transparent fallback to JS when WASM unavailable; JSON-based serialization (Phase 1 baseline)
- **Phase 6**: Equivalence validation — 200+ paragraph corpus (11 new test cases) proving TS and Rust implementations produce identical break positions
- **Phase 7**: Performance benchmarking — 6 workloads (short para, long para, multi-column, catalog, cold startup, memory ceiling) baseline measurements

**GSUB feature support** (via rustybuzz)
- OpenType ligature substitution (`liga`, `rlig` features)
- Single substitution — superscript/subscript via `sups`/`subs` features with `Font.variant`
- Advance width measurement accounts for substituted glyphs
- Cross-library tolerance: `0.025 pt/glyph` (opentype.js vs rustybuzz measurement differences)

**Optimization framework** (Phase 8 preparation)
- Binary serialization functions in `src/wasm-binary.ts` (Float64Array + Uint8Array)
- `traceback_wasm_binary()` Rust function implemented — eliminates 50–70% of JSON overhead when activated
- Binary path deferred to Phase 8 pending equivalence validation

### Fixed

**Critical rendering bugs (v0.5 cleanup)**
- `unitsPerEm` hardcoded as `2048` in `render.ts` and `pdf.ts` — now read from `FontEngine.getFontMetrics()` (fixes Roboto and all non-2048 UPM fonts)
- Missing `ctx.beginPath()` before each glyph in Canvas renderer — paths were accumulating into a single union shape
- `Glyph` interface had `id?: number` but opentype.js uses `index` — field renamed to `index: number` (required); removed all `as any` casts
- Lazy loading defeated by top-level `require('opentype.js')` in `measure.ts` — moved into `getOpenType()` lazy loader
- `FontMetrics` defined in both `types.ts` and `font-engine.ts` — consolidated; `font-engine.ts` now re-exports from `types.ts`
- `pdf.ts` IIFE executed at import time — `PDFDocument` require moved inside `renderToPdf()` call

### Changed

- **Font measurement**: Switched default from opentype.js to rustybuzz WASM (faster, more standards-compliant)
  - Fallback to opentype.js when WASM unavailable
  - opentype.js demoted from critical dependency to fallback-only
- **Letter spacing**: Now uses post-GSUB glyph count (correct for ligature fonts)
- **Line width precision**: Improved by using float64 throughout WASM boundary
- **`render.ts` metrics cache**: Simplified from `Map<string, Map<number, number>>` to `Map<string, number>` — `unitsPerEm` is font-level, not size-level
- **`pdf.ts`**: Dedicated `upmCache` per-fontId; consistent with `render.ts`

### Known limitations (updated)

- BiDi / RTL still require HarfBuzz contextual lookup (planned v0.7)
- Contextual substitution (GSUB type 6/8) not yet supported — ligatures/sups/subs only
- WASM currently JSON-based (Phase 1); ArrayBuffer optimization deferred to Phase 8
- WASM module initialization: ~2.4ms on cold startup (isolated from per-paragraph cost)

---

## [0.1.0] — 2026-03-29

Initial release.

### Added

**Core algorithm**
- Knuth-Plass optimal line breaking with TeX-faithful demerits, badness (`round(100 × |r|³)`), and consecutive-hyphen penalty (`DOUBLE_HYPHEN_PENALTY = 3000`)
- Prefix-sum optimisation for O(1) range queries over width, stretch, and shrink
- Active-node pruning: one best candidate per line count per break position (supports looseness)
- Emergency stretch fallback — second forward pass with wider glue when no solution exists within tolerance
- `looseness` parameter: select a solution with `optimal.lineCount + looseness` lines
- `widowPenalty` and `orphanPenalty` — extra demerits applied during the forward pass
- `consecutiveHyphenLimit` — enforced during the forward pass, not as a post-processing filter
- `lineWidths[]` — per-line width override for multi-column and runaround layouts
- `BreakpointResult { node, usedEmergency }` — clean single-call API; no external retry logic

**Hyphenation**
- Liang's algorithm via the `hyphen` package; 22 language patterns
- Soft hyphen (U+00AD) preservation with `SOFT_HYPHEN_PENALTY = 0`
- Font-size-derived `minLeft` / `minRight` boundary enforcement (`max(2, round(size/6))`)
- Skip guards: short words, digits, URLs, acronyms, mid-sentence proper nouns

**Font measurement**
- Real glyph metrics via `opentype.js` with pairwise kerning
- OS/2 table metrics: `ascender`, `descender`, `xHeight`, `capHeight`, `lineGap` with hhea fallback
- TeX-convention space metrics: width from space glyph advance; stretch = em/6; shrink = em/9
- `letterSpacing` tracking applied to box widths
- Error recovery in font loading with font ID and file path in error messages
- Font registry listing in not-found errors

**Node model**
- `Box`, `Glue`, `Penalty` nodes as per Knuth-Plass
- `Glue.kind: 'word' | 'termination'` — explicit discriminant, no implicit font-as-sentinel

**Composition**
- `composeParagraph` → `ComposedLine[]` with `words`, `fonts`, `wordRuns`, `wordSpacing`, `ratio`, `alignment`, `hyphenated`, `isWidow`, `lineWidth`, `lineHeight`, `baseline`
- `wordRuns: SpanSegment[][]` — per-word span detail for mixed-font rendering
- `lineHeight` and `baseline` from OS/2 metrics of the line's first font
- `isWidow` correctly set on last line when single content word
- `justifyLastLine` with real ratio computation (not the termination-glue ratio)
- Guard: `lineWidth` required when `justifyLastLine = true`

**High-level API**
- `createParagraphComposer(registry)` factory — async, loads en-us on construction
- `composer.ensureLanguage(language)` — idempotent async language loader
- `ParagraphInput.spans: TextSpan[]` — mixed-font input with per-run fonts
- `spansToWords` + `mapFragmentsToSegments` — distributes hyphenation fragment boundaries across source spans
- `fontPerWord` callback for per-word font override (plain text path)

### Known limitations

- Latin-script only. BiDi / RTL requires HarfBuzz (planned v0.5).
- No contextual substitution (GSUB type 6/8); ligatures and feature-based variants only.
- `letterSpacing` uses post-GSUB glyph count; accurate with ligature fonts.
- WASM module ~2.4ms cold startup; JSON boundary (Phase 1 baseline, ArrayBuffer planned Phase 2+).

---

[Unreleased]: https://github.com/YOUR_ORG/knuth-plass/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_ORG/knuth-plass/releases/tag/v0.1.0

