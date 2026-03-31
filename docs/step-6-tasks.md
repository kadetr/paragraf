# Step 6 — Extract `@paragraf/render-pdf` + Delete `1-knuth-plass`

**Target package**: `2b-render-pdf/`  
**Source files moving**: `pdf.ts` (all imports already cross-package ✅)  
**Source files deleted**: `types.ts` (backward-compat re-export shim, no longer needed)  
**Tests moving to `2b-render-pdf`**: `pdf.test.ts`, `pdf-document.test.ts`  
**Tests moving to `3a-typography`**: `e2e.test.ts` (zero PDF imports — tests typography composition only)  
**Final act**: delete the entire `1-knuth-plass` folder

---

## Pre-flight check

- [ ] All tests green: `npm test --workspaces`
- [ ] `git status` clean

---

## Task 1 — Scaffold `2b-render-pdf/`

Create:

**`2b-render-pdf/package.json`**:
```json
{
  "name": "@paragraf/render-pdf",
  "version": "0.1.0",
  "description": "PDF rendering backend for the paragraf typesetter.",
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
    "@paragraf/font-engine": "*",
    "@paragraf/render-core": "*",
    "@paragraf/typography": "*",
    "pdfkit": "^0.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.19.15",
    "@types/pdfkit": "^0.17.5",
    "typescript": "^5.4.0",
    "vitest": "^3.2.4"
  }
}
```

**`2b-render-pdf/tsconfig.json`** — same as other packages, with `"rootDir": "."`:
```json
{
  "compilerOptions": {
    "target":            "ES2022",
    "module":            "ESNext",
    "moduleResolution":  "bundler",
    "rootDir":           ".",
    "strict":            true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop":   true,
    "skipLibCheck":      true,
    "resolveJsonModule": true,
    "outDir":            "./dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**`2b-render-pdf/vitest.config.ts`** — copy from any sibling package.

---

## Task 2 — Add workspace entry

In root `package.json`, add `"2b-render-pdf"` to the `workspaces` array (place after `2a-render-core`).

Remove `"1-knuth-plass"` from the `workspaces` array.

---

## Task 3 — Copy `pdf.ts` verbatim

```
1-knuth-plass/src/pdf.ts  →  2b-render-pdf/src/pdf.ts
```

No import changes needed — all three imports are already cross-package:
- `@paragraf/render-core`
- `@paragraf/typography`
- `@paragraf/font-engine`

---

## Task 4 — Create `2b-render-pdf/src/index.ts` barrel

```ts
export { renderToPdf, renderDocumentToPdf } from './pdf.js';
export type { PdfOptions, DocumentPdfOptions } from './pdf.js';
```

---

## Task 5 — Move `pdf.test.ts` and `pdf-document.test.ts` to `2b-render-pdf/tests/`

| File | Import changes needed |
|------|-----------------------|
| `pdf.test.ts` | `from '../src/pdf'` → `from '@paragraf/render-pdf'` |
| `pdf-document.test.ts` | `from '../src/pdf'` (×2) → `from '@paragraf/render-pdf'` |

`FONTS_DIR = path.resolve(__dirname, '../../fonts')` — path stays the same since `2b-render-pdf/` is at the same depth as `1-knuth-plass/`.

---

## Task 6 — Move `e2e.test.ts` to `3a-typography/tests/`

`e2e.test.ts` has no PDF imports — only `@paragraf/typography` and `@paragraf/types`. It belongs with typography tests.

No import changes needed (all imports already cross-package ✅).

`FONTS_DIR = path.resolve(__dirname, '../../fonts')` — same relative depth, no change needed.

---

## Task 7 — Delete `1-knuth-plass/`

```bash
rm -rf 1-knuth-plass/
```

This removes:
- `src/pdf.ts`, `src/types.ts`
- `tests/e2e.test.ts`, `tests/pdf.test.ts`, `tests/pdf-document.test.ts`
- `package.json`, `tsconfig.json`, `vitest.config.ts`
- `wasm/` subtree (the compiled wasm lives in `1b-shaping-wasm` now)
- `scripts/`, `fonts/` symlinks if any

> Confirm `fonts/` are at the monorepo root and not only inside `1-knuth-plass/` before deleting.

---

## Task 8 — `npm install` + verify

```bash
npm install
npm test --workspaces
```

Expected passing counts:
- `2b-render-pdf`: 20 tests (`pdf` + `pdf-document`)
- `3a-typography`: 159 + e2e tests (~165+)
- All other packages: unchanged

---

## Task 9 — Commit

```bash
git add -A
git commit -m "extract @paragraf/render-pdf, delete 1-knuth-plass"
```

---

## Final package map after step 6

| Package | Folder | Contents |
|---------|--------|----------|
| `@paragraf/types` | `0-types` | shared type definitions |
| `@paragraf/linebreak` | `1a-linebreak` | Knuth-Plass algorithm |
| `@paragraf/shaping-wasm` | `1b-shaping-wasm` | WASM font shaping engine |
| `@paragraf/font-engine` | `1c-font-engine` | font metrics + fontkit adapter |
| `@paragraf/render-core` | `2a-render-core` | SVG/canvas layout |
| `@paragraf/render-pdf` | `2b-render-pdf` | PDF output |
| `@paragraf/typography` | `3a-typography` | compositor + document model |
| `@paragraf/color` | `2-color` | color utilities |

`1-knuth-plass` — deleted ✅
