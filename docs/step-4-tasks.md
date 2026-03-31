# Step 4 — Extract `@paragraf/render-core`

**Goal:** Move `render.ts` out of `1-knuth-plass` into a new standalone package `2a-render-core`.

**New package:** `@paragraf/render-core` in folder `2a-render-core/`

---

## Files moving out of `1-knuth-plass`

| Source | Destination |
|---|---|
| `src/render.ts` | `2a-render-core/src/render.ts` |
| `tests/render.test.ts` | `2a-render-core/tests/render.test.ts` |

**Staying in `1-knuth-plass` for now** (they import from render, but also import from paragraph/document which aren't extracted yet):
- `tests/bidi.test.ts` — imports `layoutParagraph` from `../src/render` (also needs `paragraph`)
- `tests/render-wasm.test.ts` — imports `layoutParagraph`, `renderToSvg` from `../src/render` (also needs `paragraph`)
- `tests/pdf.test.ts` — imports `layoutParagraph`, `RenderedParagraph` from `../src/render` (also needs `paragraph` + `pdf`)
- `tests/baseline-grid.test.ts` — imports from `document` (not `render` directly)

These all move together in step 5 (`3a-typography`) and step 6 (`2b-render-pdf`).

---

## 1. Scaffold `2a-render-core`

### `2a-render-core/package.json`
```json
{
  "name": "@paragraf/render-core",
  "version": "0.1.0",
  "description": "Canvas/SVG layout engine for the paragraf typesetter.",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paragraf/types": "*",
    "@paragraf/font-engine": "*"
  },
  "devDependencies": {
    "@types/node": "^22.19.15",
    "tsx": "^4.21.0",
    "typescript": "^5.4.0",
    "vitest": "^3.2.4"
  }
}
```

### `2a-render-core/tsconfig.json`
Copy from `1c-font-engine/tsconfig.json` verbatim.

### `2a-render-core/vitest.config.ts`
Copy from `1c-font-engine/vitest.config.ts` verbatim (no coverage exclusions needed).

---

## 2. Register in root workspace

In `/paragraf/package.json`, add `"2a-render-core"` to the `workspaces` array:

```json
"workspaces": [
  "0-types",
  "1a-linebreak",
  "1b-shaping-wasm",
  "1c-font-engine",
  "2a-render-core",
  "1-knuth-plass",
  "2-color"
]
```

---

## 3. Copy `render.ts` into new package — no content changes needed

`render.ts` imports only:
- `ComposedParagraph`, `Font`, `Measurer` — from `@paragraf/types` ✅
- `FontEngine` — from `@paragraf/font-engine` ✅

Both are already cross-package imports. Copy verbatim.

---

## 4. Create `2a-render-core/src/index.ts`

```ts
export type {
  PositionedSegment,
  RenderedLine,
  RenderedParagraph,
} from './render.js';
export { layoutParagraph, renderToSvg, renderToCanvas } from './render.js';
```

---

## 5. Move `tests/render.test.ts`

Copy to `2a-render-core/tests/render.test.ts` then delete the original.

### Update imports inside the moved test

```ts
// BEFORE
import {
  layoutParagraph,
  renderToSvg,
  renderToCanvas,
  RenderedParagraph,
} from '../src/render';

// AFTER
import {
  layoutParagraph,
  renderToSvg,
  renderToCanvas,
  RenderedParagraph,
} from '@paragraf/render-core';
```

The test also imports from `@paragraf/font-engine` and `@paragraf/types` directly
(already cross-package) — those are unchanged.

The test imports `createParagraphComposer` from `'../src/paragraph'`:

```ts
// BEFORE
import { createParagraphComposer } from '../src/paragraph';

// AFTER
import { createParagraphComposer } from '@paragraf/knuth-plass';
```

Wait — `paragraf-knuth-plass` is not published as `@paragraf/...`. Its `package.json`
`name` field is `"paragraf-knuth-plass"`. Add it as a dev dependency and import by
that name:

```ts
import { createParagraphComposer } from 'paragraf-knuth-plass';
```

Add to `2a-render-core/package.json` devDependencies:
```json
"paragraf-knuth-plass": "*"
```

---

## 6. Update `1-knuth-plass` — replace local render imports

Four files still in `1-knuth-plass` import from `../src/render`:

### `src/document.ts`
```ts
// BEFORE
import { layoutParagraph, RenderedParagraph } from './render.js';

// AFTER
import { layoutParagraph, RenderedParagraph } from '@paragraf/render-core';
```

While in `document.ts`, also fix the other broken import from step 2:
```ts
// BEFORE
import { Measurer } from './measure.js';

// AFTER
import { Measurer } from '@paragraf/types';
```

### `tests/bidi.test.ts`
```ts
// BEFORE
import { layoutParagraph } from '../src/render';

// AFTER
import { layoutParagraph } from '@paragraf/render-core';
```

### `tests/render-wasm.test.ts`
```ts
// BEFORE
import { layoutParagraph, renderToSvg } from '../src/render';

// AFTER
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
```

### `tests/pdf.test.ts`
```ts
// BEFORE
import { layoutParagraph, RenderedParagraph } from '../src/render';

// AFTER
import { layoutParagraph, RenderedParagraph } from '@paragraf/render-core';
```

---

## 7. Add `@paragraf/render-core` dep to `1-knuth-plass`

In `1-knuth-plass/package.json`, add to `dependencies`:
```json
"@paragraf/render-core": "*"
```

---

## 8. Delete `src/render.ts` from `1-knuth-plass`

After confirming tests pass.

---

## 9. Install + verify

```bash
npm install
npm test --workspaces
```

Expected:
- `2a-render-core`: render.test all green
- `1-knuth-plass`: all remaining tests green (bidi, render-wasm, paragraph, pdf, document, e2e, optical-margin, baseline-grid, pdf-document)
- All other packages: unchanged

---

## 10. Commit

```bash
git add -A && git commit -m "extract @paragraf/render-core"
```

---

## Summary of files deleted from `1-knuth-plass` after this step

- `src/render.ts`
- `tests/render.test.ts`

Still in `1-knuth-plass` after this step:
- `src/paragraph.ts`, `src/optical-margin.ts`, `src/document.ts` (→ step 5)
- `src/pdf.ts` (→ step 6)
- `tests/render-wasm.test.ts`, `tests/bidi.test.ts`, `tests/paragraph.test.ts`, `tests/render-wasm.test.ts`, `tests/baseline-grid.test.ts`, `tests/optical-margin.test.ts`, `tests/pdf.test.ts`, `tests/pdf-document.test.ts`, `tests/document.test.ts`, `tests/e2e.test.ts`
