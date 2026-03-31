# paragraf-knuth-plass — v0.9+ Roadmap

Updated: 2026-03-30

---

## v0.9 — Document Model / Multi-Paragraph

> **Why first**: Imposition, PDF/X, and any multi-column layout all require a document
> model. Building it now prevents the single-paragraph assumption from calcifying.

### Core
- [ ] Define `Document` type: ordered list of `ParagraphInput[]` with shared style defaults
- [ ] `composeDocument(doc, options)` — runs compose() per paragraph, returns `ComposedDocument`
- [ ] Page break detection: track accumulated line heights, emit page breaks when frame fills
- [ ] `RenderedDocument` type: `RenderedPage[]`, each with `RenderedParagraph[]` + page geometry
- [ ] `layoutDocument(composed, measurer, origin)` — geometry pass for full documents
- [ ] Thread model: named text frames that overflow spills into next frame (InDesign "threading")

### Column layout
- [ ] `ColumnFrame` type: `{ x, y, width, height, columnCount, gutter }`
- [ ] Column overflow: when a column fills, continue composition in the next column
- [ ] `lineWidths[]` per-column derived from frame geometry

### Vertical justification
- [ ] Distribute extra vertical space across a column so top + bottom baselines align
- [ ] Two modes: `'none'` | `'justify'` (add leading between paragraphs) | `'spread'` (add leading between lines)

### Tests
- [ ] Unit: `composeDocument` with 3 paragraphs, verify correct page break positions
- [ ] Unit: column overflow — text flowing from col 1 → col 2
- [ ] Integration: mixed LTR + RTL paragraphs in the same document

---

## v0.10 — Baseline Grid + Optical Margin Alignment

### Baseline Grid Engine
- [ ] `BaselineGrid` type: `{ first: number, interval: number }` (y of first baseline, grid interval)
- [ ] Snap `ComposedLine.baseline` to grid during composition (round up to nearest grid line)
- [ ] Multi-paragraph grid alignment: grid is document-scoped, not paragraph-scoped
- [ ] Option: `snapToGrid?: BaselineGrid` on `ParagraphInput`
- [ ] Edge case: first line of a frame that doesn't start on a grid line

### Optical Margin Alignment (two-pass)
- [ ] Build protrusion table: per glyph/character class, left and right protrusion amounts
  - Hyphens, dashes: ~50% protrusion
  - Commas, periods: ~70% protrusion
  - Quotation marks: ~80% protrusion
  - Round brackets: ~30% protrusion
- [ ] Pass 1: compose with nominal `lineWidths`
- [ ] Extract first/last character per line from `ComposedLine`
- [ ] Pass 2: adjust `lineWidths[i]` by `-(leftProtrusion + rightProtrusion)` per line, recompose
- [ ] Hanging punctuation (optical protrusion into left margin) — subset of the above

### Tests
- [ ] Unit: baseline grid snap — paragraph with 3 lines, verify baseline positions are multiples of interval
- [ ] Unit: protrusion table lookup for common punctuation
- [ ] Unit: two-pass recompose changes line break positions vs single-pass
- [ ] Visual: render paragraph with/without optical margin alignment side-by-side

---

## v0.11 — Press-Ready PDF/X Generator

> Depends on: v0.9 (document model), paragraf-color (ICC profiles)

### PDF/X-4 compliance
- [ ] OutputIntent dictionary: `/GTS_PDFXVersion`, `/DestOutputProfile`, `/OutputConditionIdentifier`
- [ ] BleedBox, TrimBox, ArtBox support on each page
- [ ] Crop marks and bleed guides generation
- [ ] No encryption (PDF/X requirement)
- [ ] Verify pdfkit exposes low-level PDF structure for OutputIntent (may require raw stream injection)

### Color integration (paragraf-color)
- [ ] Accept `ColorManager` interface (Option A) or raw `iccProfile: Buffer` (Option B — v1)
- [ ] Tag all fill colors with source profile
- [ ] Convert untagged device RGB to output profile CMYK on render

### Tests
- [ ] Integration: generate PDF/X-4 file, verify with `mutool show` or similar
- [ ] Unit: BleedBox dimensions correct given bleed amount
- [ ] Unit: OutputIntent stream contains correct profile bytes

---

## v0.12 — Imposition Engine

> Depends on: v0.11 (complete, press-ready PDFs to impose)

- [ ] Signature layouts: saddle-stitch (4pp, 8pp, 16pp, 32pp), perfect binding
- [ ] N-up: 2-up, 4-up reader spreads and printer spreads
- [ ] Creep compensation for saddle-stitch (inner pages shift inward)
- [ ] Page order mapping: logical page n → physical sheet/position
- [ ] Rust/WASM: PDF page content stream transformation (affine transforms, page reordering)
- [ ] Output: single press-sheet PDF per form

### Tests
- [ ] Unit: 8pp saddle-stitch page order is correct (pages 8,1 / 2,7 / 6,3 / 4,5)
- [ ] Unit: creep offset increases toward spine
- [ ] Integration: impose a 16-page document, verify page count and orientation

---

## v0.13 — Mixed-Direction Inline BiDi (UBA Level 2)

> BiDi scope from v0.8 was: one paragraph = one base direction.
> v0.13 scope: mixed inline (e.g. Hebrew sentence with embedded English number or URL)

- [ ] Full UBA paragraph algorithm: resolve embedding levels for mixed runs
- [ ] WASM: extend `analyze_bidi` to return per-character embedding levels (not just runs)
- [ ] `buildNodeSequence`: emit separate boxes per BiDi run within a word
- [ ] Visual reordering: apply L2 (reverse RTL sequences properly within a line)
- [ ] BiDi punctuation mirroring: `(` → `)` in RTL context
- [ ] Numeric sequences: European digits in RTL context (UBA AN/EN rules)
- [ ] Tests: Hebrew sentence with embedded URL, Arabic with English product codes

---

## Manual Test Enhancements

### RTL Structural Verification (MT-02, MT-03)
> Language-independent programmatic checks — no Arabic/Hebrew knowledge required.
- [ ] MT-02: verify first word has higher x than last word on each line (RTL x-ordering)
- [ ] MT-02: verify no segment's `x + width` exceeds column right edge (boundary check)
- [ ] MT-02: verify all segments on the same line share the same baseline y
- [ ] MT-02: verify no zero-width segments (shaping failure indicator)
- [ ] MT-03: same four checks applied to Arabic output
- [ ] MT-02/03: verify word count per line is consistent with total word count (no words dropped)

### Font Weight / Style Coverage (MT-16)
> New manual test: compose paragraphs using thin, regular, medium, bold, black weights of the same family.
- [ ] MT-16: load 5 weight variants (Thin/100, Regular/400, Medium/500, Bold/700, Black/900)
- [ ] MT-16: verify `lineHeight` increases with weight (heavier fonts have larger OS/2 ascenders in most families)
- [ ] MT-16: verify glyph advance widths increase with weight (black > bold > regular > thin)
- [ ] MT-16: verify mixed-weight paragraph (body Regular + subheading Bold inline) uses max lineHeight
- [ ] MT-16: render all 5 weights side by side → SVG + PDF visual comparison
- [ ] MT-16: check that `fontId` cache key correctly distinguishes weights (no cross-contamination)

---

## Cross-Cutting / Ongoing

- [x] **Bump `package.json` to `0.11.0`** — already at 0.11.0
- [x] **Fix `PositionedSegment.font: any`** — already typed as `Font` in render.ts
- [x] **Remove dead `toWasmJson`** — already removed
- [x] **Replace `glyphForCodePoint` stub** — made optional in `FontEngine` interface; removed dead throw from `WasmFontEngine`
- [x] **Deduplicate OS/2 metrics logic** — `readFontMetrics` was already extracted; no duplication remains
- [x] **Deduplicate `metricsCache` / `upmCache`** — no such caches exist; already consolidated
- [x] **Add RTL warning** when `spans` input is silently ignored in RTL path — already present in paragraph.ts
- [x] **Fix `fontCache` key** in measure.ts — already keyed by `fontId`, not `filePath`

## Layer Split Preparation

- [ ] Create `0-types/` package: pure interface/type/const module, zero deps
- [ ] Set up npm workspaces in monorepo root `package.json`
- [ ] Update all 30 import sites in `src/` and `tests/` from `'./types'` → `'@paragraf/types'`
- [ ] Verify TypeScript path resolution and test run after extraction
- [ ] Publish `0-types` to npm before `1a` and `1b`
- [ ] `1a-knuth-plass`: algorithm only (hyphenate → nodes → linebreak → traceback → compose); depends on `@paragraf/types` only
- [ ] `1b-wasm-implementation`: Rust/WASM engine + WasmFontEngine; depends on `@paragraf/types`
- [ ] Keep current `1-knuth-plass` as the all-in-one orchestration package (re-exports 1a + 1b)
