# Step 3 — Extract `@paragraf/shaping-wasm`

**Goal:** Move the Rust/WASM shaping engine out of `1-knuth-plass` into a new standalone package `1b-shaping-wasm`.

**New package:** `@paragraf/shaping-wasm` in folder `1b-shaping-wasm/`

---

## Files moving out of `1-knuth-plass`

| Source | Destination |
|---|---|
| `src/wasm-binary.ts` | `1b-shaping-wasm/src/wasm-binary.ts` |
| `src/engines/wasm-engine.ts` | `1b-shaping-wasm/src/engines/wasm-engine.ts` |
| `wasm/Cargo.toml` | `1b-shaping-wasm/wasm/Cargo.toml` |
| `wasm/src/lib.rs` | `1b-shaping-wasm/wasm/src/lib.rs` |
| `wasm/pkg/` (all files) | `1b-shaping-wasm/wasm/pkg/` |
| `tests/wasm.test.ts` | `1b-shaping-wasm/tests/wasm.test.ts` |
| `tests/binary-debug.test.ts` | `1b-shaping-wasm/tests/binary-debug.test.ts` |
| `tests/equivalence.test.ts` | `1b-shaping-wasm/tests/equivalence.test.ts` |

**Do not move** `wasm/target/` — it's a Rust build artifact directory (large, reproducible).

**Deferred:** `tests/render-wasm.test.ts` stays in `1-knuth-plass` for now because it
imports `createParagraphComposer` from `../src/paragraph` and `layoutParagraph` from
`../src/render`, which aren't extracted yet. It will move to `3a-typography` in step 5.

---

## 1. Scaffold `1b-shaping-wasm`

### `1b-shaping-wasm/package.json`
```json
{
  "name": "@paragraf/shaping-wasm",
  "version": "0.1.0",
  "description": "Rust/WASM shaping engine for the paragraf typesetter.",
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

### `1b-shaping-wasm/tsconfig.json`
Copy from `1c-font-engine/tsconfig.json` verbatim (same compiler options).

### `1b-shaping-wasm/vitest.config.ts`
Copy from `1c-font-engine/vitest.config.ts` verbatim (no coverage exclusions needed).

---

## 2. Register in root workspace

In `/paragraf/package.json`, add `"1b-shaping-wasm"` to the `workspaces` array:

```json
"workspaces": [
  "0-types",
  "1a-linebreak",
  "1b-shaping-wasm",
  "1c-font-engine",
  "1-knuth-plass",
  "2-color"
]
```

---

## 3. Move source files

Copy then delete:
- `1-knuth-plass/src/wasm-binary.ts` → `1b-shaping-wasm/src/wasm-binary.ts`
- `1-knuth-plass/src/engines/wasm-engine.ts` → `1b-shaping-wasm/src/engines/wasm-engine.ts`
- `1-knuth-plass/wasm/Cargo.toml` → `1b-shaping-wasm/wasm/Cargo.toml`
- `1-knuth-plass/wasm/src/` → `1b-shaping-wasm/wasm/src/`
- `1-knuth-plass/wasm/pkg/` → `1b-shaping-wasm/wasm/pkg/`

No content changes inside `wasm-binary.ts` itself — its only external import is
`Node` from `@paragraf/types` which is already correct.

---

## 4. Fix import in `wasm-engine.ts`

In `1b-shaping-wasm/src/engines/wasm-engine.ts`, replace the broken local import:

```ts
// BEFORE
import {
  FontEngine,
  Glyph,
  GlyphPath,
  FontMetrics,
  PathCommand,
} from '../font-engine';
```

```ts
// AFTER
import {
  FontEngine,
  Glyph,
  GlyphPath,
  FontMetrics,
  PathCommand,
} from '@paragraf/font-engine';
```

The `Font` import from `@paragraf/types` on the line below stays unchanged.

---

## 5. Create `1b-shaping-wasm/src/index.ts`

This barrel also provides `loadShapingWasm()` — a factory that does the CJS require
internally so callers never need to know the relative path to `wasm/pkg/`.

```ts
export { WasmFontEngine } from './engines/wasm-engine.js';
export { serializeNodesToBinary, tracebackWasmBinary } from './wasm-binary.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

/**
 * Load the compiled Rust/WASM module synchronously.
 * Throws if the WASM package is not present (e.g. wasm-pack not run).
 * The returned object is the raw wasm-bindgen JS module.
 */
export function loadShapingWasm(): unknown {
  return _require('../wasm/pkg/knuth_plass_wasm.js');
}
```

---

## 6. Update `1-knuth-plass/src/paragraph.ts`

Two local imports become cross-package imports, and the inline `_require` for the
wasm binary is replaced with `loadShapingWasm()`.

### 6a. Replace the three wasm-related imports (lines ~34-35)

```ts
// BEFORE
import { tracebackWasmBinary } from './wasm-binary.js';
import { WasmFontEngine } from './engines/wasm-engine.js';
```

```ts
// AFTER
import {
  WasmFontEngine,
  tracebackWasmBinary,
  loadShapingWasm,
} from '@paragraf/shaping-wasm';
```

### 6b. Replace the wasm loading block

```ts
// BEFORE
try {
  const _require = createRequire(import.meta.url);
  _wasm = _require('../wasm/pkg/knuth_plass_wasm.js');
} catch (e) {
  _wasmError = e instanceof Error ? e.message : String(e);
}
```

```ts
// AFTER
try {
  _wasm = loadShapingWasm();
} catch (e) {
  _wasmError = e instanceof Error ? e.message : String(e);
}
```

### 6c. Remove `createRequire` import (if no longer used)

Check the top of `paragraph.ts` — if `createRequire` is only used for the wasm
block, remove the import: `import { createRequire } from 'module';`

---

## 7. Add `@paragraf/shaping-wasm` dep to `1-knuth-plass`

In `1-knuth-plass/package.json`, add to `dependencies`:

```json
"@paragraf/shaping-wasm": "*"
```

---

## 8. Fix `render-wasm.test.ts` (stays in `1-knuth-plass`)

This test stays but its local imports must be updated now that the source files
have moved.

### 8a. Update `WasmFontEngine` import

```ts
// BEFORE
import { WasmFontEngine } from '../src/engines/wasm-engine';
```

```ts
// AFTER
import { WasmFontEngine, loadShapingWasm } from '@paragraf/shaping-wasm';
```

### 8b. Replace the direct wasm `_require` in the test

```ts
// BEFORE
const _require = createRequire(import.meta.url);
// ...
wasm = _require('../wasm/pkg/knuth_plass_wasm.js');
```

```ts
// AFTER
wasm = loadShapingWasm();
```

Remove the `createRequire` import from `render-wasm.test.ts` if it's no longer used.

---

## 9. Move test files

Copy then delete:
- `1-knuth-plass/tests/wasm.test.ts` → `1b-shaping-wasm/tests/wasm.test.ts`
- `1-knuth-plass/tests/binary-debug.test.ts` → `1b-shaping-wasm/tests/binary-debug.test.ts`
- `1-knuth-plass/tests/equivalence.test.ts` → `1b-shaping-wasm/tests/equivalence.test.ts`

### Import paths inside the moved tests

All three tests contain:
```ts
const wasm = require('../wasm/pkg/knuth_plass_wasm.js');
```
This resolves relative to `tests/`, so it becomes `1b-shaping-wasm/wasm/pkg/knuth_plass_wasm.js`
after the move — the relative path is identical. **No change needed.**

`binary-debug.test.ts` also has:
```ts
import { serializeNodesToBinary } from '../src/wasm-binary.js';
```
This is still a local import within the new package — **no change needed.**

All three tests import from `@paragraf/linebreak`, `@paragraf/font-engine`, `@paragraf/types` —
those are already correct cross-package imports.

---

## 10. Install + verify

```bash
# From monorepo root
npm install

# Run all workspaces
npm test --workspaces
```

Expected results:
- `1b-shaping-wasm`: wasm.test, binary-debug.test, equivalence.test all green
- `1-knuth-plass`: remaining tests (paragraph, render, bidi, render-wasm, pdf, document, e2e, optical-margin) all green
- `1c-font-engine`, `1a-linebreak`: unchanged, still green

---

## 11. Commit

```bash
git add -A && git commit -m "extract @paragraf/shaping-wasm"
```

---

## Summary of files deleted from `1-knuth-plass` after this step

- `src/wasm-binary.ts`
- `src/engines/wasm-engine.ts`
- `tests/wasm.test.ts`
- `tests/binary-debug.test.ts`
- `tests/equivalence.test.ts`
- `wasm/Cargo.toml`, `wasm/src/`, `wasm/pkg/`

Still in `1-knuth-plass` after this step:
- `src/paragraph.ts`, `src/optical-margin.ts`, `src/document.ts` (→ step 5)
- `src/render.ts` (→ step 4)
- `src/pdf.ts` (→ step 6)
- `tests/render-wasm.test.ts`, `tests/paragraph.test.ts`, `tests/bidi.test.ts`, `tests/render.test.ts`, `tests/baseline-grid.test.ts`, `tests/optical-margin.test.ts`, `tests/pdf.test.ts`, `tests/pdf-document.test.ts`, `tests/document.test.ts`, `tests/e2e.test.ts`
