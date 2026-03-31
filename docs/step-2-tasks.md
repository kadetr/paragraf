# Step 2 — `@paragraf/font-engine` (`1c-font-engine`)

Extract the font metrics abstraction, fontkit adapter, and measurer factory into a
standalone package. `1-knuth-plass` retains no local font code after this step.

---

## Source files to move

| From `1-knuth-plass/src/` | To `1c-font-engine/src/` | Notes |
|---|---|---|
| `font-engine.ts` | `font-engine.ts` | Interface only; zero external deps |
| `measure.ts` | `measure.ts` | Mocks split out (see 2d) |
| `engines/fontkit-engine.ts` | `engines/fontkit-engine.ts` | Keep sub-dir; fix import path |

New files: `1c-font-engine/src/testing.ts` and `1c-font-engine/src/index.ts`.

---

## Test files to move

| From `1-knuth-plass/tests/` | To `1c-font-engine/tests/` |
|---|---|
| `measure.test.ts` | `measure.test.ts` |

---

## Subtasks

### 2a — Scaffold the package
- [ ] Create `1c-font-engine/package.json`
  - name: `@paragraf/font-engine`
  - prod deps: `@paragraf/types`, `fontkit`
  - devDeps: `typescript`, `vitest`, `@vitest/coverage-v8`
- [ ] Create `1c-font-engine/tsconfig.json` (mirror `1a-linebreak/tsconfig.json`)
- [ ] Create `1c-font-engine/vitest.config.ts` (mirror `1a-linebreak/vitest.config.ts`)
- [ ] Add `"1c-font-engine"` to root `package.json` workspaces array

### 2b — Move source files
- [ ] Copy `font-engine.ts` to `1c-font-engine/src/font-engine.ts` — no import changes needed
- [ ] Copy `measure.ts` to `1c-font-engine/src/measure.ts` — remove mock exports (moved to testing.ts in 2d)
- [ ] Copy `engines/fontkit-engine.ts` to `1c-font-engine/src/engines/fontkit-engine.ts`
  - Fix: `from '../font-engine.js'` → `from '../font-engine.js'` (same relative path, unchanged)

### 2c — Check `measure.ts` for stray type re-exports
`measure.ts` currently re-exports `MeasureText`, `GlueSpaceFn`, `GlueSpaceMetrics`, `Measurer`,
`GetFontMetrics` from `@paragraf/types`. Per architecture decisions, downstream packages do not
re-export types on behalf of `@paragraf/types`. Remove those re-export lines from the moved
`1-font-engine/src/measure.ts`.

### 2d — Extract mocks to `testing.ts`
Create `1-font-engine/src/testing.ts` with `mockMeasure`, `mockSpace`, `mockMetrics` — moved
verbatim from `measure.ts`. Remove them from `measure.ts`.

```ts
// 1c-font-engine/src/testing.ts
import type { MeasureText, GlueSpaceFn, GlueSpaceMetrics, GetFontMetrics, FontMetrics } from '@paragraf/types';

export const mockMeasure: MeasureText = ...
export const mockSpace: GlueSpaceFn = ...
export const mockMetrics: GetFontMetrics = ...
```

### 2e — Create `src/index.ts` barrel

```ts
// Core interface
export type { FontEngine, Glyph, GlyphPath, PathCommand } from './font-engine';

// fontkit adapter
export { FontkitEngine } from './engines/fontkit-engine';

// Measurer factory + fontkit helpers
export { createMeasurer, loadFontkitFont, resolveFontkitFont } from './measure';

// Testing utilities
export { mockMeasure, mockSpace, mockMetrics } from './testing';
```

### 2f — Update `1-knuth-plass` source files
Two source files still import from the local `./measure` and `./font-engine`:

**`src/paragraph.ts`** (currently line 28–32):
```ts
// Before
import { createMeasurer, Measurer, GlueSpaceMetrics } from './measure';
import { FontEngine } from './font-engine';

// After
import { createMeasurer, FontEngine } from '@paragraf/font-engine';
import { Measurer, GlueSpaceMetrics } from '@paragraf/types';
```

**`src/render.ts`** (currently lines 4–5):
```ts
// Before
import { Measurer } from './measure';
import { FontEngine } from './font-engine';

// After
import { Measurer } from '@paragraf/types';
import { FontEngine } from '@paragraf/font-engine';
```

- [ ] Update `src/paragraph.ts` imports
- [ ] Update `src/render.ts` imports
- [ ] Add `"@paragraf/font-engine": "*"` to `1-knuth-plass/package.json` dependencies
- [ ] Delete `1-knuth-plass/src/measure.ts`
- [ ] Delete `1-knuth-plass/src/font-engine.ts`
- [ ] Delete `1-knuth-plass/src/engines/fontkit-engine.ts`

### 2g — Move and fix `measure.test.ts`
- [ ] Copy `tests/measure.test.ts` to `1c-font-engine/tests/measure.test.ts`
- [ ] Update imports:
  - `from '../src/measure'` → split: `createMeasurer` from `../src/measure`,
    `mockMeasure`, `mockSpace` from `../src/testing`, `Measurer` from `@paragraf/types`
  - Font paths: already `../../fonts/` (no change needed)
- [ ] Delete `1-knuth-plass/tests/measure.test.ts`

### 2h — Fix remaining `1-knuth-plass` test imports
Eight test files still import from the deleted local source files:

| Test file | Change |
|---|---|
| `render.test.ts` | `mockMeasure/mockMetrics/mockSpace/createMeasurer` from `@paragraf/font-engine`; `FontEngine` from `@paragraf/font-engine`; `FontkitEngine` from `@paragraf/font-engine` |
| `render-wasm.test.ts` | `createMeasurer` from `@paragraf/font-engine` |
| `binary-debug.test.ts` | `createMeasurer` from `@paragraf/font-engine` |
| `equivalence.test.ts` | `createMeasurer` from `@paragraf/font-engine` |
| `wasm.test.ts` | `createMeasurer` from `@paragraf/font-engine` |
| `pdf.test.ts` | `createMeasurer` from `@paragraf/font-engine`; `FontkitEngine` from `@paragraf/font-engine` |
| `baseline-grid.test.ts` | mocks from `@paragraf/font-engine`, `Measurer` from `@paragraf/types` |
| `bidi.test.ts` | `Measurer` from `@paragraf/types` (was re-exported via `../src/measure`) |

### 2i — Verify and commit
- [ ] Run `npm install` at monorepo root
- [ ] Run `npm test` inside `1c-font-engine/` — all moved tests pass
- [ ] Run `npm test` inside `1-knuth-plass/` — all remaining tests pass
- [ ] Commit: `"extract @paragraf/font-engine"`

---

## Public API (`1-font-engine/src/index.ts`)

| Export | Source |
|---|---|
| `FontEngine`, `Glyph`, `GlyphPath`, `PathCommand` | `font-engine.ts` (interfaces) |
| `FontkitEngine` | `engines/fontkit-engine.ts` |
| `createMeasurer`, `loadFontkitFont`, `resolveFontkitFont` | `measure.ts` |
| `mockMeasure`, `mockSpace`, `mockMetrics` | `testing.ts` |

Types (`Measurer`, `MeasureText`, `GlueSpaceFn`, `GlueSpaceMetrics`, `GetFontMetrics`,
`FontMetrics`) live in `@paragraf/types` and are **not** re-exported here — callers import
them directly from `@paragraf/types`.

---

## Dependency graph after Step 2

```
@paragraf/types
    ↑
@paragraf/linebreak   @paragraf/font-engine
(1a-linebreak)        (1c-font-engine)
         ↑                    ↑
              1-knuth-plass (remaining: paragraph, render, wasm, pdf, document)
```
