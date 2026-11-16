# Changelog

All notable changes to this project will be documented in this file.

---

## v0.7.1 — unreleased

### ⚠️ Line breaks change in German text and in text that contains URLs

Two things caused most overfull lines in 0.7.0: German nouns were never hyphenated, and a URL was one unbreakable piece. Both are fixed. Two smaller rules changed with them: e-mail addresses are no longer hyphenated, and a word in capitals is recognised with punctuation attached and with letters outside A–Z. Output for other text is unchanged: in the golden corpus only three paragraphs have a new snapshot, and all three contain a URL (the corpus had no German paragraph; it has one now).

**There is no switch for this in `compose()` or `compile()`.** The two options below, `processCapitalized` and `breakUrls`, exist only in `@paragraf/linebreak` (`HyphenateOptions`); `compose()` does not pass them on. From `compose()` and `compile()` the only way back to the 0.7.0 treatment of capitalised German words and of URLs is `hyphenation: false` on the paragraph or style, which switches all hyphenation off.

#### German: capitalised words are hyphenated by default
The hyphenator skips a capitalised word in mid-sentence, on the assumption that it is a proper noun. In German every noun is capitalised, so long compounds had no break points and stuck out of narrow columns.

- With `language: 'de'`, capitalised words are now hyphenated. `de` is the only shipped language that capitalises all nouns; any `de-…` variant added later is treated the same.
- Every other language keeps the proper-noun rule.
- An explicit `processCapitalized: true` or `false` in `HyphenateOptions` wins over the language default. This holds for callers of `hyphenateWord` / `hyphenateParagraph` in `@paragraf/linebreak` only; `compose()` and `compile()` have no such option and always use the language default.
- **German paragraphs can break differently from 0.7.0**, at any column width: capitalised words are now candidates for hyphenation everywhere, not only where a line used to be overfull.
- Proper names in German text are hyphenated too, with German patterns: `Shake-speare`, `Hil-de-brandt`, but also `Wa-shing-ton`. See "What is still not handled".
- Words in capitals (`UNESCO`) and words that contain a digit are still not hyphenated, in any language.

#### Words in capitals: recognised with punctuation and in any script
A word in capitals is now any token with no lower-case letter and at least two upper-case letters (Unicode classes). In 0.7.0 the test was `A`–`Z` only and failed when punctuation was attached, which did not show in German because capitalised words were skipped anyway.

- Without this, the German change above would have hyphenated `BUNDESREPUBLIK,` or `(NATO)`.
- **Changed from 0.7.0 in every language:** `GRÖSSE`, `ÉLECTRICITÉ`, `„ACHTUNG“` and, at the start of a paragraph or sentence, `INTERNATIONAL,` were hyphenated and are now left whole. No paragraph in the golden corpus or in the manual-test exports is affected.

#### E-mail addresses are not hyphenated
A token with an `@` between letters or digits is left whole. In 0.7.0 an address without a digit was hyphenated like a word, with a hyphen that is not part of the address (`first-name.last-name@uni-ver-si-ty.ex-am-ple.org`).

- **A paragraph that contains an e-mail address can break differently from 0.7.0**, and an address wider than the column is now an overfull line where 0.7.0 broke it with a hyphen. An address has no break points of its own.
- No paragraph in the golden corpus or in the manual-test exports contains an address, so none changed.

#### URLs: break points without a hyphen
A URL-like token can now be broken:

- **after** `/`, `?`, `&`, `=`, `#`, `_` and `-` (after the last one when several follow each other);
- **before** a `.` that is followed by a letter or digit, so that no line ends in a dot that reads like the end of a sentence;
- never inside the scheme or its `://` (a break directly after `://` is allowed);
- never so that fewer than two characters of the URL are left on either side.

No hyphen is added at such a break, and the line is not marked `hyphenated`. A URL is never passed to the pattern hyphenator. In 0.7.0 that was only true for `http://` and `https://`: a `www.` address without digits could be hyphenated like a word (`www.exam-ple.org`).

Breaking after the separators follows the LaTeX `url` package (`\UrlBreaks`, and its `hyphens` option for `-`). Breaking before the dot and adding no hyphen follows the Chicago Manual of Style (17th ed., 14.18). Chicago also puts the break *before* `/ ? # _ -` and advises against a line that ends in a hyphen belonging to the URL; that part is not followed.

What counts as a URL, deliberately narrow:

| Detected | Example |
|---|---|
| `http://`, `https://`, `ftp://` | `https://example.com/a/b` |
| `www.` followed by a name and a dot | `www.example.org` |
| a bare host followed by `/`, written in lower case, with a top-level domain from the list below | `example.com/docs/intro`, `sub.example.co.uk/x` |

Top-level domains accepted for a bare host: `com org net edu gov info io dev app eu de uk fr es nl ch ca au jp se dk fi cz br cn`. The list is short on purpose: a dot and a slash also occur in `Node.js/Express`, `README.md/CHANGELOG.md` or `index.html/#top`, so domains that are also common file extensions or abbreviations (`md`, `js`, `sh`, `it`, `at`, `to`, `me`, `us`, …) are left out. A URL under any other domain is detected when it is written with its scheme or with `www.`.

Not detected: a bare host without a slash (`example.com`), a bare host with a capital letter or under a domain that is not on the list (`example.it/docs` is treated as a word and can be hyphenated, as in 0.7.0), e-mail addresses, file paths, other schemes. Punctuation around a URL, as in `(https://example.com/a).`, stays attached to the first or last piece and gets no break.

Each break point is a penalty of 200 (a hyphenation point is 50), so a URL is broken only where the line would otherwise be clearly loose or could not be set.

- **A paragraph that contains a URL can break differently from 0.7.0**, including paragraphs that had no overfull line.
- A URL is now measured and positioned in pieces, as hyphenated words always were. Each piece is a text run of its own in `ComposedLine.wordRuns` and in the rendered segments; `ComposedLine.words` still has one entry for the URL. **A URL that is not broken can be slightly narrower or wider than in 0.7.0**, for the two reasons that already applied to every word with hyphenation points: letter-spacing is added between the characters of a piece but not between two pieces (with `letterSpacing: 1`, `https://example.com/a/very/long/path/index.html` has nine pieces and is 8 pt narrower than in 0.7.0), and kerning is not applied across a piece boundary (`https://www.AVATAR.To/WAVE/To.Yo` in Liberation Serif 12 pt: 191.18 pt instead of 190.40 pt). With no letter-spacing and no kerning pair at a boundary the URL is set exactly as before.
- New option `HyphenateOptions.breakUrls` (`@paragraf/linebreak`), default `true`. `false` restores the 0.7.0 treatment in `hyphenateWord` / `hyphenateParagraph`. `compose()` and `compile()` do not pass this option: there, `hyphenation: false` on the paragraph or style keeps URLs in one piece, together with switching hyphenation off, and there is no separate switch.
- `HyphenatedWord.hyphenable` is `false` for a URL although `fragments` has more than one entry: the fragments are break points that take no hyphen. `buildNodeSequence` puts a zero-width, unflagged penalty between them. Code that builds `HyphenatedWord` objects by hand with several fragments must set `hyphenable: true` to get hyphens, as `hyphenateWord` always did.
- `composeParagraph` now treats **any** unflagged penalty that directly follows a box as a break point inside a word: when the line does not break there, the box after it is appended to the same entry of `ComposedLine.words` and `wordRuns`. It does not look at the penalty value or at where the penalty came from. `buildNodeSequence` only produces that pattern for URLs, so its output is unaffected; a hand-built node list with box, unflagged penalty, box and no glue between them used to give two words with a space and now gives one.
- Nodes are built in TypeScript for both engines and the breakers needed no change; the Rust breaker is compared with the TypeScript one on paragraphs with these penalties in `2a-shaping-wasm/tests/url-break-parity.test.ts`.

#### What is still not handled
- A line that consists only of pieces of one URL, or of one fragment of a hyphenated word, has no space to stretch. In justified text it is set at its natural width and can end short of the right edge.
- A paragraph whose URL or compound had to be broken that way is still set by the fallback pass: `usedFallback` is `true`, `compile()` lists it in `metadata.fallbackParagraphs`, and `onInfeasible: 'throw'` still throws for it. What changes is that `metadata.overfullLines` is empty where a break point exists.
- In the fallback pass every loose line costs the same, so the breaker can leave the line before a URL very loose instead of starting the URL on it.
- Long numbers, words with digits, words in capitals and e-mail addresses still have no break points.
- URLs in right-to-left paragraphs are still unbreakable: that path does no hyphenation at all and puts no break points into a URL either.
- Proper names in German text are hyphenated with German patterns, which can be wrong for a foreign name (`Wa-shing-ton`). In `@paragraf/linebreak` a name can be kept whole or given its own break points with `exceptions` (`{ washington: false }` or `{ washington: ['Wash', 'ing', 'ton'] }`; the key is the lower-cased token, so `Washington,` with its comma needs an entry of its own). `compose()` and `compile()` do not take `exceptions`; there a soft hyphen (U+00AD) in the name limits the breaks to that place in `text` input.
- The shipped German patterns (`de-1996`) make some poor breaks in long compounds: `Rindfleischetikettierungsüberwachungsgesetz` gets `Rind-flei-sch-eti-ket-tie-rungs-…`, so a line can end in `Rindflei-` and the next begin with `schetikettierungs…`. That comes from the pattern set, not from this change; it shows now because such words were not hyphenated at all before.
- Letter-spacing and kerning are not applied across the boundary between two pieces of a URL or two fragments of a word (see above).

---

## v0.7.0 — 2026-11-16

First release on the npm registry. All thirteen `@paragraf/*` packages are at 0.7.0.

### Packaging and release

#### WASM modules were missing from the packed packages
`wasm-pack` writes a `.gitignore` containing `*` into its output folder, and `npm pack` honours it. As packed before this release, `@paragraf/color-wasm` contained no WASM module at all, and `@paragraf/shaping-wasm` would have had none either when packed from a clean build. The pack step now adds an `.npmignore` to those folders, which takes precedence. No version with this defect was published.

#### Pack check and smoke test
- `npm run pack:check` packs every package and checks the tarball: `dist/`, types, README, licence, WASM files where expected, `exports` pointing at `dist`, internal dependency ranges, no tests or sources, every relative path in the built code present in the tarball, and every imported package declared as a dependency.
- `npm run smoke -- <folder>` installs those tarballs into an empty project outside the repo and compiles the README quick-start with `shaping: 'wasm'`.
- Both run in CI on every pull request.

#### Release workflow
`.github/workflows/release.yml` runs on a `vX.Y.Z` tag that matches the package version and sits on `main`: build WASM, build, type check, tests, pack check, smoke test. A separate job then publishes the tarballs that were checked, in dependency order and with npm provenance, skipping versions already on the registry so a failed run can be repeated. Starting the workflow by hand is always a dry run.

#### Versioning
Changesets in fixed mode keeps all `@paragraf/*` packages on one version (see `.changeset/README.md`). This changelog stays hand-written.

#### `@paragraf/compile` bundled a broken copy of the colour packages
The build inlined `@paragraf/color` and `@paragraf/color-wasm` into `@paragraf/compile`. The inlined WASM loader looked for its module inside `@paragraf/compile`, failed, and every CMYK output-intent compile silently used the TypeScript transform. They are now ordinary imports.

#### Package manifests
- `exports` is `{ "types", "default" }` for every package. `require('@paragraf/…')` now works on Node 22, which can load ES modules with `require`; the packages remain ES modules.
- `engines.node` is `>=22`, the version CI tests.
- `@paragraf/shaping-wasm` no longer ships the browser (`pkg-bundler`) build: it was not reachable through `exports`, and browser use is not supported yet. This halves the package size.
- All library packages declare `publishConfig.access: "public"`.
- `@paragraf/color` gained the licence, repository and pack scripts it lacked; `@paragraf/color` and `@paragraf/color-wasm` gained `LICENSE` files; `@paragraf/color-wasm` gained a README.
- Root: `vite` moved from `dependencies` to `devDependencies`.

### ⚠️ Breaking: infeasible paragraphs no longer throw by default

#### Overfull fallback (`onInfeasible`)
A paragraph that cannot be set within `tolerance` (even with `emergencyStretch`) used to throw "Paragraph could not be set within tolerance". One long URL could therefore stop a whole batch. The default is now to return lines anyway:

- The breaker runs a last pass that accepts every line that fits, however loose. Without `emergencyStretch` this is what an unlimited tolerance would give; a finite higher tolerance can choose different breaks.
- Where one unbreakable piece is wider than the measure (a long URL, a word that cannot be hyphenated), the line holding it is wider than its measure and sticks out: to the right for left-aligned and justified text, to the left for right-aligned text, on both sides for centred text. In justified text its spaces are fully shrunk.
- In this last pass `consecutiveHyphenLimit` and `looseness` are ignored: enforcing them could only make more lines stick out or add near-empty lines.
- Nothing is silent. `ParagraphOutput.usedFallback` is `true`; a line that sticks out has `overfull: true` and `overflow` (points) on its `ComposedLine`; `compile()` lists such lines in `metadata.overfullLines` (paragraph index, line index, overflow, text), lists every paragraph set by the fallback in `metadata.fallbackParagraphs`, and prints one warning unless `verbose: false`.
- `overflow` is measured against the line's measure (the frame width less `leftSkip` and `rightSkip`) before glyph expansion; with `maxGlyphExpansion > 0` the drawn line is slightly narrower than reported.
- `emergencyStretch` is still tried first. A paragraph it rescues is not a fallback. A paragraph it could not rescue reports both `usedEmergency: true` and `usedFallback: true`.
- Paragraphs that could already be set are unchanged: in the golden corpus only the four paragraphs that used to throw have a new snapshot. One exception: with `tolerance: Infinity`, a line with nothing to stretch now reports `ratio: 0`, where it reported `Infinity` (`null` from the WASM engine).

**To keep the old behaviour**, pass `onInfeasible: 'throw'` to `compose()`, `computeBreakpoints()` or `compile()`.

New and changed API:

| Where | Change |
|---|---|
| `ParagraphInput`, `Paragraph` (`@paragraf/types`), `CompileOptions` | new option `onInfeasible?: 'throw' \| 'overfull'`, default `'overfull'` |
| `ParagraphOutput`, `BreakpointResult` | new required field `usedFallback: boolean` |
| `ComposedLine`, `LineBreak` | new optional fields `overfull`, and `overflow` on `ComposedLine`; present only on overfull lines |
| `CompileResult.metadata` | new required fields `overfullLines`, `fallbackParagraphs` |
| `tracebackWasmBinary()` | new last argument `onInfeasible`; result carries `usedFallback` |

Code that builds a `ParagraphOutput` or a `CompileResult` by hand (a mock composer in a test, for example) must add the new required fields.

Both engines implement the fallback and are compared on infeasible paragraphs in `2a-shaping-wasm/tests/linebreak-parity.test.ts`.

### ⚠️ Breaking: `shaping: 'wasm'` is now strict

#### Shaping mode (`shaping`)
`createParagraphComposer` and `createDefaultFontEngine` accept `shaping: 'auto' | 'wasm' | 'fontkit'`, the same values `compile()` already took.

- `'wasm'` throws when the WASM shaper is not built or failed to load. Before, `compile({ shaping: 'wasm' })` fell back to fontkit without saying so. This also applies to `createCompilerSession`.
- `compile({ session, shaping: 'wasm' })` throws when the session is not on WASM. With a session, `'auto'` and `'fontkit'` are still ignored and the session's engine is used.
- `'auto'` (default) still falls back to fontkit, and now prints one warning when it does (once per process or worker thread). `verbose: false` on `compile()`, `compileBatch()` or `createCompilerSession()` suppresses it; `createCompilerSession` has a new `verbose` option for this.
- `'fontkit'` does not print the fallback warning.
- Studio: the shaping setting is now applied (it never was: the session always used `'auto'`). "JS" (`compile.shaping: "js"`) compiles with fontkit, "WASM" with the WASM shaper or, when it is not usable, a compile error in the preview. A template without `compile.shaping` compiles on `'auto'` as before, and the selector now shows a new "Auto" entry for it instead of "JS". New projects are created with `"auto"`; existing projects that were created with `"js"` now really compile with fontkit, so their line breaks can change. Set the selector to "Auto" to keep the previous output.
- `useWasm` is deprecated. `false` means `'fontkit'`; `true` means `'auto'`, as before (it never was strict).
- New exported type `ShapingMode` in `@paragraf/typography`.

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
