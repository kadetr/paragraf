# Excuse Me Kemal, I Forked Up

A comprehensive audit of steps 1–9 (task completion) and all documentation
written as part of step 10 so far (accuracy). Produced April 1, 2026.

---

## Part 1 — Step completion audit (Steps 1–9)

### Step 1 — `@paragraf/linebreak` ✅

All subtasks complete. Package exists at `1a-linebreak/`, all source files
extracted, tests moved and passing. 134 tests passing in this package.
Font fixtures at monorepo root `fonts/` as planned.

### Step 2 — `@paragraf/font-engine` ✅

All subtasks complete. Package exists at `1b-font-engine/`. `FontkitEngine`,
`createMeasurer`, `loadFontkitFont`, `resolveFontkitFont` exported correctly.
Mock utilities split into `testing.ts`. 60 tests passing.
Note: folder was renamed `1b-font-engine` instead of `1c-font-engine` as
planned in the task file. The package name `@paragraf/font-engine` is correct.

### Step 3 — `@paragraf/shaping-wasm` ✅

Package exists at `2a-shaping-wasm/`. Rust/WASM artifacts in `wasm/pkg/`.
`WasmFontEngine`, `loadShapingWasm`, `serializeNodesToBinary`,
`tracebackWasmBinary` all exported. 68 tests passing.
Folder was renamed `2a-shaping-wasm` instead of `1b-shaping-wasm` as
planned in the task file. Package name correct.

### Step 4 — `@paragraf/render-core` ✅

Package exists at `2b-render-core/`. Layout, SVG, Canvas rendering exported.
Document types (`Frame`, `BaselineGrid`, `RenderedDocument`, etc.) also
exported from here. 33 tests passing.
Folder was renamed `2b-render-core` instead of `2a-render-core` as planned.

### Step 5 — `@paragraf/typography` ✅

Package exists at `3a-typography/`. `createParagraphComposer`,
`createDefaultFontEngine`, `wasmStatus`, `composeDocument`, `layoutDocument`,
optical margin functions all exported. 160 tests passing.

### Step 6 — `@paragraf/render-pdf` ✅

Package exists at `3b-render-pdf/`. `renderToPdf` and `renderDocumentToPdf`
exported. 20 tests passing.

### Step 7 — `@paragraf/color` ✅

Package exists at `0-color/`. ICC profiles, transforms, color manager, LUT
interpolation all exported. 58 tests passing.

### Step 8 — Manual test suite ✅

22 manual test scripts exist at `tests/manual/scripts/` (15 ported + 7 new
parameter sweeps). `run-all.ts` runner present. Fixture infrastructure
(`documents.ts`, `fonts.ts`, `output.ts`, `text.ts`) present. Full suite
invokable via `npm run manual` from root.

### Step 8.5 — Pre-publish bug fixes ✅

A1 (WASM last-line ratio clamp), A2 (RTL spans throw), A3 (Unicode safety),
A4 (multi-frame width warn) all applied. B1–B4 (files field, publishConfig,
WASM external, version 0.3.0) applied across all 8 package.json files.
533 unit tests pass.

### Step 9 — Build pipeline ✅

`tsup` installed at root. `tsup.config.ts` created for all 8 packages.
`build` scripts in all `package.json` files. All 8 packages build cleanly to
`dist/index.js` + `dist/index.d.ts`. WASM glue correctly kept external.
`wasm/pkg/.npmignore` added to work around wasm-pack's `*` gitignore.
`npm pack --dry-run` verified on all 8 packages — correct file inclusion.

**Step 1–9 completion: all complete. 533 unit tests passing.**

---

## Part 2 — Documentation accuracy audit (Step 10, D1–D8)

This is where the forking happened. Eight pieces of documentation were written
with multiple wrong function signatures and missing install dependencies.
Each issue is catalogued below with the exact wrong code and the correct version.

---

### Issue 1 — `3b-render-pdf/README.md`: `renderToPdf` signature is completely wrong

**Severity: Critical — code will not compile or run.**

**What the README says:**
```ts
const stream = createWriteStream('output.pdf');
await renderToPdf(renderedParagraph, fontEngine, registry, stream, {
  width: 595.28,
  height: 841.89,
  fill: 'black',
});
```

**What the actual signature is:**
```ts
renderToPdf(
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  options?: PdfOptions,
): Promise<Buffer>
```

`registry` is not a parameter. `stream` is not a parameter. The function
returns `Promise<Buffer>` — the caller writes the buffer to disk themselves.
The README passes 5 arguments to a 3-argument function.

---

### Issue 2 — `3b-render-pdf/README.md`: `renderDocumentToPdf` signature is completely wrong

**Severity: Critical — code will not compile or run.**

**What the README says:**
```ts
const stream = createWriteStream('document.pdf');
await renderDocumentToPdf(renderedDocument, fontEngine, registry, stream, {
  pageWidth: 595.28,
  ...
});
```

**What the actual signature is:**
```ts
renderDocumentToPdf(
  renderedDoc: RenderedDocument,
  fontEngine: FontEngine,
  options?: DocumentPdfOptions,
): Promise<Buffer>
```

Same error. `registry` and `stream` do not exist as parameters.

---

### Issue 3 — `3b-render-pdf/README.md`: "Full pipeline example" also wrong

**Severity: Critical — code will not compile or run.**

**What the README says:**
```ts
const stream = createWriteStream('output.pdf');
await renderToPdf(rendered, fontEngine, registry, stream);
```

**What it should be:**
```ts
const pdfBuffer = await renderToPdf(rendered, fontEngine);
writeFileSync('output.pdf', pdfBuffer);
```

---

### Issue 4 — `2b-render-core/README.md`: `renderToSvg` missing `fontEngine` argument

**Severity: Critical — code will not compile or run.**

**What the README says:**
```ts
const svg = renderToSvg(rendered, { width: 595, height: 842 });
```

**What the actual signature is:**
```ts
renderToSvg(
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  viewport: { width: number; height: number },
): string
```

`fontEngine` is the second argument. The README skips it entirely, passing the
viewport object as the second arg which receives `fontEngine`. This would fail
at runtime when the engine tries to call methods on a plain object.

---

### Issue 5 — `2b-render-core/README.md`: `renderToCanvas` missing `fontEngine` argument

**Severity: Critical — code will not compile or run.**

**What the README says:**
```ts
renderToCanvas(rendered, ctx); // HTMLCanvasElement 2D context
```

**What the actual signature is:**
```ts
renderToCanvas(
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  ctx: CanvasRenderingContext2D,
): void
```

Same issue — `fontEngine` is the second argument and is omitted.

---

### Issue 6 — `1b-font-engine/README.md`: `loadFontkitFont` signature is wrong

**Severity: High — code will not run with these arguments.**

**What the README says:**
```ts
const engine = new FontkitEngine();
await loadFontkitFont(engine, descriptor);
```

**What the actual signature is:**
```ts
loadFontkitFont(filePath: string, fontId: string): any
```

`loadFontkitFont` takes two strings, not `(engine, descriptor)`. It is a
cache-backed function that opens a font file synchronously and returns the
raw fontkit font object. It does not receive a `FontkitEngine` instance.

To load a font into a `FontkitEngine`, use `engine.loadFont(id, filePath)`.
These are two completely different things. The README conflates them.

---

### Issue 7 — `docs/getting-started.md`: install command missing `@paragraf/types`

**Severity: High — TypeScript users will get "cannot find module" errors.**

**What the guide says (Section 1):**
```bash
npm install @paragraf/typography @paragraf/font-engine @paragraf/render-core @paragraf/render-pdf
```

**What the guide then does (Sections 2, 4, 5):**
```ts
import { FontRegistry } from '@paragraf/types';  // Section 2
import { Font }         from '@paragraf/types';  // Section 4
import { TextSpan }     from '@paragraf/types';  // Section 5
```

`@paragraf/types` is directly imported three times in the same guide but not
listed in the install command. While npm installs it transitively as a dep of
`@paragraf/typography`, TypeScript requires the package to be in your own
`package.json` to import from it directly.

---

### Issue 8 — `docs/getting-started.md` Section 8: `renderToSvg` missing `fontEngine`

**Severity: Critical — code will not run.**

**What the guide says:**
```ts
import { renderToSvg } from '@paragraf/render-core';

const svg = renderToSvg(rendered, { width: 595, height: 842 });
```

**What the actual signature requires:**
```ts
const svg = renderToSvg(rendered, fontEngine, { width: 595, height: 842 });
```

`fontEngine` was never created in this section of the guide. The SVG section
appears immediately after the PDF section (Section 7). The guide would need to
show how to obtain a `fontEngine` (via `createDefaultFontEngine` from
`@paragraf/typography`) before this call.

---

### Issue 9 — `2b-render-core/README.md`: `layoutParagraph` example uses undeclared `measurer`

**Severity: Medium — incomplete example.**

The README shows:
```ts
const rendered = layoutParagraph(composedParagraph, measurer, { x: 72, y: 72 });
```

But `measurer` is never created in the example. The README doesn't explain that
`measurer` comes from `createMeasurer(registry)` in `@paragraf/font-engine`.
A user reading only this README has no idea where `measurer` comes from.

---

### Issue 10 — `3a-typography/README.md`: document model section uses `layoutDocument` without showing measurer creation

**Severity: Medium — incomplete example.**

The multi-paragraph document section shows:
```ts
const composed    = composeDocument(doc, composer);
const renderedDoc = layoutDocument(composed, measurer);
```

But `measurer` is never declared in that section. The install command
(`npm install @paragraf/typography @paragraf/types`) does not include
`@paragraf/font-engine`, which is where `createMeasurer` lives. Someone
following only this README for the document model path has neither the
package nor the creation call.

---

### Issue 11 — `3b-render-pdf/README.md`: install command incomplete

**Severity: Medium — imports will fail.**

```bash
npm install @paragraf/render-pdf @paragraf/render-core @paragraf/font-engine
```

The "full pipeline example" in the same README imports from
`@paragraf/typography` (`createParagraphComposer`, `createDefaultFontEngine`)
which is not in the install command.

---

## Part 3 — Step 10 scope issue

The roadmap listed "HTML/CSS usage notes for browser-safe packages" as a
Step 10 item. This was correctly identified as premature — there is no
browser-facing entry point yet — and moved to the getting-started.md as a
brief compatibility matrix. However, the roadmap itself (`docs/roadmap.md`)
has not been updated to remove this item from the Step 10 scope. That is
task D11 in the step-10-tasks.md plan, which has not been done.

---

## Summary of issues by severity

| # | File | Issue | Severity |
|---|---|---|---|
| 1 | `3b-render-pdf/README.md` | `renderToPdf` has wrong params (registry, stream) | Critical |
| 2 | `3b-render-pdf/README.md` | `renderDocumentToPdf` has wrong params | Critical |
| 3 | `3b-render-pdf/README.md` | Full pipeline example also wrong | Critical |
| 4 | `2b-render-core/README.md` | `renderToSvg` missing `fontEngine` arg | Critical |
| 5 | `2b-render-core/README.md` | `renderToCanvas` missing `fontEngine` arg | Critical |
| 6 | `1b-font-engine/README.md` | `loadFontkitFont(engine, descriptor)` — wrong params entirely | High |
| 7 | `docs/getting-started.md` | Install command missing `@paragraf/types` | High |
| 8 | `docs/getting-started.md` | `renderToSvg` missing `fontEngine` + not in scope | Critical |
| 9 | `2b-render-core/README.md` | `layoutParagraph` example uses undeclared `measurer` | Medium |
| 10 | `3a-typography/README.md` | `layoutDocument` example uses undeclared `measurer` | Medium |
| 11 | `3b-render-pdf/README.md` | Install missing `@paragraf/typography` | Medium |

**Critical: 6 issues. High: 2 issues. Medium: 3 issues. Total: 11 issues.**

All 11 will be fixed before D9 and D10 are written. They were caused by writing
documentation without running a pass against the actual source signatures — the
exact mistake you should never make with code examples.

---

## What comes next

1. Fix all 11 issues above in the affected files
2. Write D9 (`docs/document-model.md`) with correct cross-references
3. Write D10 (`docs/io-schemas.md`) with verified field-level accuracy
4. Update D11 (`docs/roadmap.md` Step 10 scope)
