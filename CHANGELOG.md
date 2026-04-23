# Changelog

All notable changes to this project will be documented in this file.

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

#### `widowPenalty` / `orphanPenalty` semantics clarified

These parameters apply a per-paragraph *runt-line* demerit (a single-word first or last line within the paragraph), not frame-level widow/orphan control. The parameter names are unchanged, but the JSDoc and Known Limitations section now accurately describe their scope.

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
