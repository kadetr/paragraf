# Step 5 — Extract `@paragraf/typography`

**Target package**: `3a-typography/`  
**Scope**: paragraph compositor + optical-margin + document model  
**Source files moving**: `paragraph.ts`, `optical-margin.ts`, `document.ts`  
**Tests moving**: `paragraph.test.ts`, `optical-margin.test.ts`, `document.test.ts`, `baseline-grid.test.ts`, `bidi.test.ts`, `render-wasm.test.ts`

---

## Pre-flight check

- [ ] All tests green: `npm test --workspaces`
- [ ] `git status` clean

---

## Task 1 — Scaffold `3a-typography/`

Create:

- `3a-typography/package.json`

```json
{
  "name": "@paragraf/typography",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@paragraf/types": "*",
    "@paragraf/linebreak": "*",
    "@paragraf/font-engine": "*",
    "@paragraf/shaping-wasm": "*",
    "@paragraf/render-core": "*"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- `3a-typography/tsconfig.json` — copy from `1c-font-engine/tsconfig.json` (standard TS config)

- `3a-typography/vitest.config.ts` — copy from `1c-font-engine/vitest.config.ts`

---

## Task 2 — Add workspace entry

In root `package.json`, add `"3a-typography"` to the `workspaces` array.

---

## Task 3 — Copy source files verbatim

Copy from `1-knuth-plass/src/` to `3a-typography/src/` **without modifying imports** — the relative refs between these three files remain valid within the new package:

- `paragraph.ts` — local import `./optical-margin.js` stays as-is
- `optical-margin.ts` — local import `./paragraph.js` stays as-is
- `document.ts` — local imports `./paragraph.js` stay as-is; all other imports already cross-package

All cross-package imports in these files are already correct:
- `@paragraf/types`, `@paragraf/linebreak`, `@paragraf/font-engine`, `@paragraf/shaping-wasm`, `@paragraf/render-core`

---

## Task 4 — Create `3a-typography/src/index.ts` barrel

```ts
// paragraph compositor
export {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
} from './paragraph.js';
export type {
  ParagraphInput,
  ParagraphOutput,
  ParagraphComposer,
  ComposerOptions,
} from './paragraph.js';

// optical margin alignment
export {
  PROTRUSION_TABLE,
  lookupProtrusion,
  buildOmaAdjustments,
  buildOmaInput,
} from './optical-margin.js';

// document model
export {
  snapCursorToGrid,
  gridAdvance,
  deriveLineWidths,
  composeDocument,
  layoutDocument,
} from './document.js';
export type {
  BaselineGrid,
  Frame,
  Document,
  ComposedDocument,
  RenderedItem,
  RenderedPage,
  RenderedDocument,
} from './document.js';
```

---

## Task 5 — Move test files to `3a-typography/tests/`

Move the following 6 files from `1-knuth-plass/tests/` to `3a-typography/tests/`:

| File | Import changes needed |
|------|----------------------|
| `paragraph.test.ts` | `../src/paragraph` → `@paragraf/typography` |
| `optical-margin.test.ts` | `../src/optical-margin` → `@paragraf/typography`, `../src/paragraph` → `@paragraf/typography` |
| `document.test.ts` | `../src/document.js` → `@paragraf/typography`, `../src/paragraph.js` → `@paragraf/typography` |
| `baseline-grid.test.ts` | `../src/document` → `@paragraf/typography`, `../src/paragraph` → `@paragraf/typography` |
| `bidi.test.ts` | `../src/paragraph` → `@paragraf/typography` (other cross-package imports already correct) |
| `render-wasm.test.ts` | `../src/paragraph` → `@paragraf/typography` (other cross-package imports already correct) |

> **Note on `render-wasm.test.ts`**: The original roadmap placed this test in `1b-shaping-wasm`, but it imports `createParagraphComposer` which would create a circular dep (`shaping-wasm` → `typography` → `shaping-wasm`). It belongs in `3a-typography` instead.

---

## Task 6 — Fix `1-knuth-plass/src/pdf.ts` (collateral)

`pdf.ts` has three stale local imports from files that have been or will be deleted. Fix them:

| Old import | New import |
|-----------|-----------|
| `from './render.js'` | `from '@paragraf/render-core'` |
| `from './document.js'` | `from '@paragraf/typography'` |
| `from './font-engine.js'` | `from '@paragraf/font-engine'` |

Add `@paragraf/typography`, `@paragraf/render-core`, `@paragraf/font-engine` to `1-knuth-plass/package.json` dependencies (if not already present).

---

## Task 7 — Fix remaining test imports in `1-knuth-plass/tests/`

These tests **stay** in `1-knuth-plass` (they test `pdf.ts` which moves in step 6):

**`tests/e2e.test.ts`**:
```
from '../src/paragraph'  →  from '@paragraf/typography'
```

**`tests/pdf.test.ts`**:
```
from '../src/paragraph'  →  from '@paragraf/typography'
```

**`tests/pdf-document.test.ts`**:
```
from '../src/document'   →  from '@paragraf/typography'
from '../src/font-engine'  →  from '@paragraf/font-engine'
(keep: from '../src/pdf' — pdf.ts stays in 1-knuth-plass until step 6)
```

---

## Task 8 — Fix `2a-render-core/tests/render.test.ts`

This test currently imports `createParagraphComposer` from `'paragraf-knuth-plass'` (a workaround added in step 4 before `paragraph.ts` had its own package).

Change:
```ts
import { createParagraphComposer } from 'paragraf-knuth-plass';
```
to:
```ts
import { createParagraphComposer } from '@paragraf/typography';
```

In `2a-render-core/package.json`:
- Remove `paragraf-knuth-plass` from `devDependencies`
- Add `"@paragraf/typography": "*"` to `devDependencies`

---

## Task 9 — Update `1-knuth-plass/package.json` exports

In step 4, `"exports": { ".": "./src/paragraph.ts" }` was added so `2a-render-core` tests could resolve `paragraf-knuth-plass`. Now that `render.test.ts` will import from `@paragraf/typography` directly, this entry is no longer needed.

Remove the `exports` field from `1-knuth-plass/package.json` (or if any other consumer still needs it, update to a valid remaining entry).

Also add `@paragraf/typography` to `1-knuth-plass/package.json` peer/dev dependencies so the test files (`e2e.test.ts`, `pdf.test.ts`, `pdf-document.test.ts`) can resolve it.

---

## Task 10 — Delete moved files from `1-knuth-plass/`

**Source files** (after verifying `3a-typography/src/` copies are correct):
- `src/paragraph.ts`
- `src/optical-margin.ts`
- `src/document.ts`

**Test files** (after verifying `3a-typography/tests/` copies are correct):
- `tests/paragraph.test.ts`
- `tests/optical-margin.test.ts`
- `tests/document.test.ts`
- `tests/baseline-grid.test.ts`
- `tests/bidi.test.ts`
- `tests/render-wasm.test.ts`

---

## Task 11 — `npm install` + verify

```bash
npm install
npm test --workspaces
```

Expected passing counts (approximate):
- `3a-typography`: ~100+ tests (paragraph + document + bidi + render-wasm)
- `1-knuth-plass`: ~30–40 tests (pdf + e2e only)
- `2a-render-core`: 33 tests
- All other packages: unchanged

---

## Task 12 — Commit

```bash
git add -A
git commit -m "extract @paragraf/typography"
```

---

## Exports summary for `@paragraf/typography`

**From `paragraph.ts`**:
- `createParagraphComposer`, `createDefaultFontEngine`, `wasmStatus`
- types: `ParagraphInput`, `ParagraphOutput`, `ParagraphComposer`, `ComposerOptions`

**From `optical-margin.ts`**:
- `PROTRUSION_TABLE`, `lookupProtrusion`, `buildOmaAdjustments`, `buildOmaInput`

**From `document.ts`**:
- `snapCursorToGrid`, `gridAdvance`, `deriveLineWidths`, `composeDocument`, `layoutDocument`
- types: `BaselineGrid`, `Frame`, `Document`, `ComposedDocument`, `RenderedItem`, `RenderedPage`, `RenderedDocument`

---

## What stays in `1-knuth-plass` after step 5

- `src/pdf.ts` (moves in step 6)
- `tests/pdf.test.ts`, `tests/pdf-document.test.ts`, `tests/e2e.test.ts`

Step 6 extracts `@paragraf/render-pdf` from `pdf.ts`.
