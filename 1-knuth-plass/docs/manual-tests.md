# paragraf-knuth-plass — Manual Test Scenarios

These are human-driven verification tests. Run after significant feature changes.
They supplement automated tests with visual and structural verification.

---

## MT-01 — LTR Typography Quality

**Goal**: verify KP output is visually superior to greedy line breaking.

**Setup**: compose a ~500-word English body text passage, 400pt column width, justified.

**Checks**:
- [ ] No very loose lines followed by very tight lines (river avoidance)
- [ ] Hyphenation appears naturally — not more than 2–3 consecutive hyphenated lines
- [ ] Last line of paragraph is left-aligned (not stretched)
- [ ] Widow line (single word on last line) triggers widow penalty and is absorbed

**Comparison**: render the same text with a simple greedy wrapper and diff the output.
The KP version should have a lower variance in inter-word spacing across all lines.

---

## MT-02 — RTL Hebrew Paragraph

**File**: use `fonts/NotoSansHebrew-Regular.ttf`

**Setup**: compose a short Hebrew paragraph (~50 words), 400pt column width.

**Checks**:
- [ ] Text flows right-to-left (first word is at the right edge of the column)
- [ ] Words are not mirrored or reversed character-by-character
- [ ] Line breaks occur at word boundaries (no mid-word breaks — RTL path skips hyphenation)
- [ ] SVG output: each segment's `x` coordinate decreases left as words progress
- [ ] Mixing LTR and RTL paragraphs in the same document: each paragraph respects its own direction

---

## MT-03 — Arabic Paragraph with Short Words

**File**: use `fonts/NotoSansArabic-Regular.ttf`

**Setup**: compose an Arabic paragraph. Arabic has short function words that affect spacing.

**Checks**:
- [ ] Direction detection returns `'rtl'`
- [ ] No hyphenation applied
- [ ] Connected Arabic glyphs are not split across words (word tokenization respects Arabic word boundaries)
- [ ] Rendered lines do not overflow the column width

---

## MT-04 — Superscript / Subscript Rendering

**Setup**: compose a `TextSpan[]` input with:
- Normal text: `"H"` (size 12)
- Subscript: `"2"` (size 12, variant: `'subscript'`)
- Normal text: `"O water molecule"` (size 12)

**Checks**:
- [ ] The `"2"` renders below the baseline of `"H"` and `"O"`
- [ ] The subscript glyph is visually smaller (GSUB `subs` applied)
- [ ] Word spacing around `"H₂O"` matches surrounding words
- [ ] Superscript scenario (`x²`): `"2"` renders above the baseline

---

## MT-05 — Mixed Font Paragraph

**Setup**: compose a line where the second word is in a larger font (e.g., 12pt → 18pt → 12pt).

**Checks**:
- [ ] `lineHeight` is derived from the tallest font on the line (no clipping)
- [ ] Baseline is consistent: normal-size words sit on the same baseline as large-size words
- [ ] Word spacing is measured from the dominant font (not the large-font's space width)

---

## MT-06 — Long URL / No-Break Word

**Setup**: compose a paragraph containing a very long URL (>60 characters) with no spaces.

**Checks**:
- [ ] With `tolerance` at default: line containing the URL overflows OR triggers emergency stretch
- [ ] With high `emergencyStretch`: the URL line is set without overflow but with a very high ratio
- [ ] The URL is never hyphenated (hyphenation guard: URL pattern)

---

## MT-07 — Widow / Orphan Control

**Setup**: compose a ~10-line paragraph where the last line would naturally be a single short word.

**Checks**:
- [ ] Without widow penalty: last line is a single word
- [ ] With `widowPenalty` set high: the final two lines are rebalanced to avoid the single-word widow
- [ ] Orphan scenario: first line of a paragraph is a single word — `orphanPenalty` forces a rebreak

---

## MT-08 — Consecutive Hyphen Limit

**Setup**: compose a narrow column (~150pt) with English text that would naturally hyphenate many consecutive lines.

**Checks**:
- [ ] With `consecutiveHyphenLimit: 2`: no more than 2 consecutive lines end in a hyphen
- [ ] With `consecutiveHyphenLimit: 0` (unlimited): observe the baseline hyphenation frequency
- [ ] Verify that the KP solver doesn't crash or loop when the limit is tight and the column is narrow

---

## MT-09 — Variable Line Widths (`lineWidths[]`)

**Setup**: compose a paragraph with `lineWidths: [200, 200, 400, 400, 400]` — simulating text wrapping around a floated image.

**Checks**:
- [ ] First two lines are shorter
- [ ] Line 3 onwards fills the full 400pt column
- [ ] No content is clipped or missing at the transition boundary
- [ ] `ComposedLine.lineWidth` reflects the per-line value, not the default

---

## MT-10 — Canvas vs SVG Output Parity

**Setup**: render the same `RenderedParagraph` to both SVG and Canvas.

**Checks**:
- [ ] Glyph positions (x/y) are identical between both renderers
- [ ] Ligatures appear in both (e.g., "fi" ligature in LiberationSerif)
- [ ] Superscript/subscript offsets are visually identical
- [ ] Canvas output has no path accumulation artifact (each glyph is independent)

---

## MT-11 — WASM vs TypeScript Parity (Equivalence)

**Setup**: run the same paragraph through both the WASM linebreak path and the TypeScript path.

**Checks**:
- [ ] `ComposedLine[]` arrays are identical in length
- [ ] Per-line `ratio`, `hyphenated`, `alignment` match exactly
- [ ] Word content per line matches
- [ ] Run `tests/equivalence.test.ts` — all tests must pass
- [ ] Test a paragraph with `looseness: 1` through both paths — same result

---

## MT-12 — PDF Output Structural Check

**Setup**: generate a PDF from a short paragraph using `renderToPdf`.

**Checks**:
- [ ] File opens without errors in Preview, Acrobat Reader, and `mutool show`
- [ ] Glyphs are outlines (not embedded text) — copy-paste from PDF does NOT yield readable text
- [ ] Font is not embedded (glyph outlines only, no font subsetting)
- [ ] Page dimensions match the defaults (A4: 595.28 × 841.89pt) unless overridden
- [ ] RTL paragraph: glyph order in the PDF content stream is visual order (right-to-left)

---

## MT-14 — Baseline Grid Alignment

**Goal**: verify that consecutive paragraphs snap their baselines to a shared grid and never drift.

**Setup**: compose a `Document` with 3–4 paragraphs of varying line heights using `layoutDocument`.
Set `frame.grid = { first: 10, interval: 14 }` (14pt grid, first baseline 10pt from frame top).

**Checks**:
- [ ] Every baseline in every paragraph satisfies `(baseline - frame.y - grid.first) % grid.interval === 0`
- [ ] After a paragraph ends mid-grid, the next paragraph's first baseline snaps forward (never backward) to the next grid line
- [ ] In a two-column frame, column 2 resets to `frame.y` and re-snaps — both columns share the same absolute grid
- [ ] A line taller than `interval` (e.g. a display heading): baseline snaps to the next grid line that provides enough room; layout does not infinite-loop
- [ ] Removing `frame.grid` (undefined): baseline positions are unchanged from the no-grid output (regression check)

**Script stub**:
```ts
import { layoutDocument, composeDocument } from '../src/document.js';
// frame.grid = { first: 10, interval: 14 }
// Assert every rendered baseline:
//   (baseline - frame.y - grid.first) % grid.interval === 0
```

---

## MT-15 — Optical Margin Alignment (two-pass)

**Goal**: verify that punctuation at column margins hangs visually into the margin, making text block edges look flush.

**Setup**: compose a justified English paragraph (~200 words) that naturally produces lines ending with
commas, periods, hyphens, and starting with opening quotes. Enable `opticalMarginAlignment: true`.

**Checks**:
- [ ] **Visual**: the column edges look more optically flush than without OMA — a trailing comma or period is not visually "pulled in"
- [ ] **xOffset**: lines starting with `"` have `xOffset ≈ -(0.7 * fontSize)` (negative = hangs left)
- [ ] **xOffset**: lines with no protruding character have `xOffset === 0`
- [ ] **Line count**: two-pass output line count is ≤ single-pass line count (wider effective lineWidth = fewer or equal breaks)
- [ ] **Regression**: `opticalMarginAlignment` omitted → `xOffset` absent/0 on all lines, breaks identical to normal output
- [ ] **RTL**: RTL paragraphs ignore the flag — no `xOffset`, breaks unchanged

**Protrusion fractions to spot-check**:

| Character  | Left  | Right |
|------------|-------|-------|
| `-` hyphen | 0.5   | 0.5   |
| `,` comma  | 0.0   | 0.7   |
| `.` period | 0.0   | 0.7   |
| `"` open   | 0.7   | 0.0   |
| `"` close  | 0.0   | 0.7   |
| `(`        | 0.3   | 0.0   |

---

## MT-13 — Large Document Stress Test

**Setup**: compose 100 paragraphs of ~200 words each.

**Checks**:
- [ ] No memory leak across compositions (node count doesn't grow unboundedly)
- [ ] Module-level caches (`fontCache`, `metricsCache`, `hyphenatorCache`) don't grow without bound
- [ ] Total compose time < 2s for the full batch (rough benchmark)
- [ ] No stale state: paragraph 100 produces the same result as paragraph 1 given the same input
