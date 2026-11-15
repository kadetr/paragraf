# Changelog

All notable changes to this project will be documented in this file.

---

## Unreleased

### ⚠️ Line breaks change

#### Line measure no longer includes the glue at the previous break
The line breaker measured every line after the first as if it still contained the space it had been broken at. Lines were therefore judged about one word space wider, and one space stretchier, than they are. The breaker chose breaks against those wrong widths, and `compose` corrected the word spacing afterwards so that lines still filled the measure.

Both engines (TypeScript and Rust/WASM) now measure a line from the first box after the previous break. Consequences:

- **Line breaks change in most justified paragraphs.** In the golden corpus, 23 of 38 paragraphs break differently, 9 keep their breaks with corrected ratios, and 6 are unchanged. Several paragraphs lose a line.
- `ComposedLine.ratio` is now the ratio the line is actually set at. For a justified line in one font, set without emergency stretch, `wordSpacing = space + ratio × stretch` (or `× shrink`). Lines that mix fonts use one uniform spacing for all gaps, and kashida lines put the fill into `kashidaSpacing`.
- The TypeScript breaker is checked against independent references (`1a-linebreak/tests/linebreak-correctness.test.ts`): a brute-force search over every legal set of breaks for paragraphs of 6–10 words, and a dynamic programme for paragraphs of 40 and 80 words. The Rust breaker is checked for identical breaks and ratios against the TypeScript one.
- Hand-built node lists only: a paragraph that ends with a word glue before the closing fill glue could previously break at that glue and leave an empty last line. That is no longer a feasible break. `buildNodeSequence` never produces such a list.

There is no option to restore the old breaks; they were not optimal under any setting.

#### `adjDemerits` now works, and is reachable
- The breaker kept one candidate per line number. With `adjDemerits > 0` the best continuation can depend on the fitness class of the current line, so it now keeps one per line number and fitness class, as TeX does. With `adjDemerits = 0` nothing changes.
- `ParagraphInput.adjDemerits` exists and is passed to both engines. The v0.6.0 notes announced it, but the field was missing and the value never reached the breaker.

#### `consecutiveHyphenLimit` no longer misses valid solutions
With a limit set, the breaker kept the cheapest candidate per line even when that candidate had already used up its hyphen run, and could then fail with "could not be set within tolerance" although a legal setting existed. The length of the current hyphen run is now part of what is kept.

#### Fractional `looseness`
The TypeScript engine now truncates a fractional `looseness` to an integer, as the WASM engine already did. Previously a fractional value was silently ignored on the TypeScript path.

### Tooling

#### Type check in CI
`npm run typecheck` runs `tsc --noEmit` in every workspace, and CI runs it before the tests. Vitest strips types, so type errors had accumulated unnoticed; all are fixed.

#### Studio build output no longer tracked
`studio/out/` is build output from `electron-vite` and went stale with every engine change. It is removed from git and ignored. Run `npm run build --workspace=studio` (or `npm run dev --workspace=studio`) to produce it.

### Fixes

#### Studio: `onOverflow: "error"` now raises an error
Studio passed its own `'error'` / `'truncate'` values straight to `@paragraf/compile`, which expects `'throw'` / `'silent'`. `'error'` was not recognised and text was truncated silently. The values are now mapped.

#### Studio: separate worker and renderer result types
`CompileWorkerResult` (worker → main, PDF as bytes) and `CompileResult` (main → renderer, PDF as a file path) replace one shared type that described neither hop correctly.
### Tests

- **Golden-output baseline.** `tests/golden/` composes 40 paragraphs (the parameters of manual scripts MT-01 … MT-22) with both the WASM engine and the TypeScript fallback and compares line breaks, adjustment ratios, word spacing and segment positions with committed snapshots. It runs as part of `npm run test:e2e`. `npm run golden:update` rewrites the snapshots; `npm run golden:preview` also writes an SVG per case to the git-ignored `tests/golden/outputs/`. Any change to line breaking now shows up as a reviewable snapshot diff. The suite also checks that each snapshot belongs to a case and that cases meant to differ (for example runt penalty on and off) really produce different output.
### Documentation

- **README accuracy.** Removed "the only" / "no other library" claims; react-pdf and Typst are now in the comparison (both do whole-paragraph line breaking). Stated plainly that the compiled WASM shaper is not committed to the repository (CI builds it; the npm package is set up to carry it), and that the `@paragraf/*` packages are not on the npm registry yet.
- **README:** the Puppeteer shaping entry is corrected (Chromium uses HarfBuzz).
- **AI-PRIMER.md** document index now lists files that exist in the repository instead of a `docs/` folder that does not.
- Removed stale version references (`v0.8`, `v0.12`, `v2`) from source comments in `@paragraf/typography`. No code change.

---

## v0.6.0 — 2026-04-23

### ⚠️ Breaking changes

#### `onOverflow` default changed to `'throw'`

**Affects:** `compileDocument()`, `compile()`, `CompilerSession`

In v0.5, the `onOverflow` option defaulted to `'silent'`, silently dropping text that did not fit in the target frame. In v0.6, the default is `'throw'`.

**Migration:** any workflow that previously relied on silent truncation will now receive an `Error` at runtime. To restore the old behaviour, pass `onOverflow: 'silent'` explicitly:

```ts
compileDocument(doc, fonts, {
  onOverflow: 'silent', // ← restore v0.5 behaviour
});
```

#### `widowPenalty` / `orphanPenalty` renamed to `runtPenalty` / `singleLinePenalty`

These parameters apply per-paragraph demerits at composition time, not frame-level widow/orphan control. `runtPenalty` is added when the last line of a paragraph contains a single word (runt line). `singleLinePenalty` is added when the entire paragraph fits on a single line (no intermediate breaks), regardless of word count. The names `widowPenalty` and `orphanPenalty` have been removed; use `runtPenalty` and `singleLinePenalty` respectively.

---

### New capabilities

#### `adjDemerits` paragraph parameter
`ParagraphInput.adjDemerits` exposes TeX's adjacent-line fitness-class mismatch penalty. Default `0` preserves backwards-compatible Knuth-Plass behaviour; set to `10 000` for TeX-equivalent quality (penalises jarring transitions between very tight and very loose consecutive lines).

#### Exception dictionaries for hyphenation
`HyphenateOptions.exceptions` accepts a per-call dictionary of word → hyphenation-point overrides, taking precedence over the Knuth-Liang pattern tables. Example:

```ts
hyphenateParagraph(spans, { lang: 'en-us', exceptions: { 'present': 'pre-sent' } });
```

#### Sentence-start hyphenation fix
Sentence-initial capitalised words (following `.`, `!`, `?`) are no longer suppressed as if they were proper nouns. The `_prevWord` heuristic in `hyphenateParagraph` correctly detects sentence boundaries.

#### ICC mft1 CMYK LUT parsing (workId 013)
`@paragraf/color` now correctly parses ICC v2 lut8Type (`mft1`) CLUT tags. Previously the parser applied the lut16Type (`mft2`) layout, reading bytes 48–51 as entry-count fields that don't exist in the mft1 format. This corrupted all CLUT lookups for mft1 profiles (Fogra39 and similar). CMYK values are now correct.

#### Bradford chromatic adaptation in ICC pipeline
`@paragraf/color` applies Bradford-adapted D50 → D65 chromatic adaptation when converting ICC Lab PCS values to sRGB for display. This produces perceptually correct colour for ICC profiles that define their PCS in D50 (the ICC standard illuminant).

#### `CompilerSession` for long-running servers
`createCompilerSession(fonts)` returns a session object that amortises font-registry and cache setup across multiple `compile()` calls. Avoids rebuilding the font index on every document in batch or server workflows.

#### `createFontRegistry` helper
`createFontRegistry(entries)` is now exported from `@paragraf/font-engine`, providing a typed, validated way to build a `FontRegistry` without going through the `CompilerSession` constructor.

---

## v0.5.0 — initial public release

Knuth-Plass optimal line breaking, 22-language hyphenation, OpenType shaping via rustybuzz, Unicode BiDi (paragraph-level), optical margin alignment, multi-frame document composition, PDF and SVG output.
