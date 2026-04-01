# Step 8 — Manual test suite

Port the 15 existing manual tests from `1-knuth-plass-v0.11/manual/` to the new
`@paragraf/*` architecture and create the infrastructure to run them. Add new
parameter-sweep scripts to complete coverage of compositor configuration options.

Manual tests are human-reviewed, output-producing scripts — not automated assertions.
They catch visual regressions and rendering correctness that mocked unit tests cannot.

---

## Pre-flight check

- [ ] All workspace tests green: `npm test --workspaces`
- [ ] `git status` clean

---

## Structure to create

```
tests/
  e2e.test.ts          (exists)
  vitest.config.ts     (exists)
  manual/
    run-all.ts
    scripts/
      mt-01-ltr-quality.ts
      mt-02-rtl-hebrew.ts
      mt-03-arabic.ts
      mt-04-superscript-subscript.ts
      mt-05-mixed-font.ts
      mt-06-long-url.ts
      mt-07-widow-orphan.ts
      mt-08-consecutive-hyphens.ts
      mt-09-variable-linewidths.ts
      mt-10-canvas-svg-parity.ts
      mt-11-wasm-ts-parity.ts
      mt-12-pdf-structure.ts
      mt-13-large-document.ts
      mt-14-baseline-grid.ts
      mt-15-optical-margin.ts
      mt-16-font-size-sweep.ts       (new)
      mt-17-line-height-sweep.ts     (new)
      mt-18-letter-spacing-sweep.ts  (new)
      mt-19-column-width-sweep.ts    (new)
      mt-20-tolerance-sweep.ts       (new)
      mt-21-looseness-sweep.ts       (new)
      mt-22-alignment-modes.ts       (new)
    fixtures/
      documents.ts
      fonts.ts
      output.ts
      text.ts
    tools/
      diff-metrics.ts
      verify-metrics.ts
    outputs/             ← gitignored (SVG / PDF / JSON artifacts)
```

---

## Task 1 — Gitignore `tests/manual/outputs/`

Add to root `.gitignore`:

```diff
 coverage/
+tests/manual/outputs/
```

---

## Task 2 — Port `fixtures/`

Copy the four fixture files from `1-knuth-plass-v0.11/manual/fixtures/` into
`tests/manual/fixtures/` and update their imports.

### `fonts.ts`
- `../../src/types.js` → `@paragraf/types`
- Font path: change `path.resolve(__dirname, '../../fonts')` → `path.resolve(__dirname, '../../../fonts')` (root `fonts/` is three levels up from `tests/manual/fixtures/`)

### `text.ts`
- No package imports — likely self-contained. Copy unchanged.

### `output.ts`
- Check for any `../../src/*` imports; update to `@paragraf/*` equivalents.
- Update output directory path to `path.resolve(__dirname, '../outputs/')`.

### `documents.ts`
- Check for `../../src/*` imports; update to `@paragraf/*` equivalents.

---

## Task 3 — Port `tools/`

Copy `diff-metrics.ts` and `verify-metrics.ts` from
`1-knuth-plass-v0.11/manual/tools/` into `tests/manual/tools/`.

- Update any `../../src/*` imports to `@paragraf/*`.
- Update fixture relative paths (`../fixtures/` stays the same relative to `tools/`).

---

## Task 4 — Port `run-all.ts`

Copy `1-knuth-plass-v0.11/manual/run-all.ts` to `tests/manual/run-all.ts`.

Update the `spawnSync` script path from:
```ts
path.join(__dirname, 'scripts', `${name}.ts`)
```
to reference the same location (should be unchanged if `__dirname` is now `tests/manual/`).

Add the 7 new script names (`mt-16` through `mt-22`) at the end of `ALL_SCRIPTS`.

---

## Task 5 — Import mapping for all 15 ported scripts

Every script imports from the old monolith source. Apply this mapping universally:

| Old import | New import |
|---|---|
| `../../src/paragraph.js` | `@paragraf/typography` |
| `../../src/measure.js` | `@paragraf/font-engine` |
| `../../src/render.js` | `@paragraf/render-core` |
| `../../src/pdf.js` | `@paragraf/render-pdf` |
| `../../src/types.js` | `@paragraf/types` |
| `../../src/linebreak.js` | `@paragraf/linebreak` |
| `../../src/wasm-binary.js` | `@paragraf/shaping-wasm` |
| `../fixtures/fonts.js` | `./fixtures/fonts.js` → `../fixtures/fonts.js` |
| `../fixtures/text.js` | `../fixtures/text.js` |
| `../fixtures/output.js` | `../fixtures/output.js` |
| `../fixtures/documents.js` | `../fixtures/documents.js` |

Scripts with special notes:
- **mt-11** (WASM/TS parity): imports from both `@paragraf/shaping-wasm` and `@paragraf/font-engine`. Verify the WASM binary is loadable from the new package path.
- **mt-12** (PDF): imports `renderToPdf` — confirm the export name in `@paragraf/render-pdf`.
- **mt-14** (baseline grid): uses BiDi and baseline grid options from `@paragraf/typography`.
- **mt-15** (optical margin): uses OMA options from `@paragraf/typography`.

---

## Task 6 — New scripts mt-16 through mt-22

Each new script follows the same shape as the ported scripts: a header comment,
real font loading via `serifRegistry`, a body text fixture, and JSON metrics written
to `outputs/`. They produce SVG output for visual inspection.

### mt-16 — Font size sweep
Render the same paragraph at 8pt, 10pt, 12pt, 14pt, 18pt, 24pt.
Metrics: line count and badness score at each size.

### mt-17 — Line height sweep
Render at line heights 1.0×, 1.2×, 1.4×, 1.6×, 2.0× of font size.
Metrics: visual density, widows/orphans count.

### mt-18 — Letter spacing sweep
Render with letter spacing −0.02em, 0em, 0.02em, 0.05em, 0.1em.
Metrics: badness distribution.

### mt-19 — Column width sweep
Render at 200px, 300px, 400px, 500px, 600px column widths.
Metrics: average line ratio variance (mirrors mt-01 for multiple widths).

### mt-20 — Tolerance sweep
Render with KP tolerance values 1, 2, 3, 5, 10 (progressively looser).
Metrics: line count, total demerits, hyphen count.

### mt-21 — Looseness sweep
Render with looseness −2, −1, 0, +1, +2.
Metrics: line count delta vs looseness=0.

### mt-22 — Alignment modes
Render with `justify`, `left`, `right`, `center`.
Produces four SVGs side by side for visual comparison.
Metrics: leftover space per line per mode.

---

## Task 7 — Root `package.json` script

Add `manual` script to root `package.json`:

```diff
   "scripts": {
-    "test:e2e": "vitest run --config tests/vitest.config.ts"
+    "test:e2e": "vitest run --config tests/vitest.config.ts",
+    "manual": "tsx tests/manual/run-all.ts"
   },
```

Verify `tsx` is available. If not in root `devDependencies`, add it:

```diff
+  "devDependencies": {
+    "tsx": "^4.0.0"
+  }
```

---

## Task 8 — Smoke-test the runner

After completing all tasks:

```bash
# Run a single script to confirm imports resolve
tsx tests/manual/scripts/mt-01-ltr-quality.ts

# Run the full suite
npm run manual

# Run a subset
tsx tests/manual/run-all.ts mt-01 mt-12 mt-14 mt-15
```

Expected: all 22 scripts exit cleanly, `tests/manual/outputs/` populated with
SVG/PDF/JSON files.

---

## Acceptance

- [ ] `tests/manual/outputs/` is gitignored
- [ ] `npm run manual` runs all 22 scripts without errors
- [ ] SVG output for mt-01 visually matches v0.11 output (side-by-side comparison)
- [ ] PDF output for mt-12 opens in a PDF viewer
- [ ] mt-14 baseline grid SVG shows correct grid alignment
- [ ] mt-15 optical margin SVG shows OMA active
- [ ] mt-11 WASM parity: both engines produce identical line-break results
- [ ] All workspace tests still green after changes: `npm test --workspaces`
