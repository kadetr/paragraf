# Step 1 — `@paragraf/linebreak`

Extract the pure Knuth-Plass algorithm + hyphenation into a standalone, browser-safe package.
No font deps. No WASM. Only `@paragraf/types` and `hyphen`.

---

## Source files to move

| From `1-knuth-plass/src/` | To `1a-linebreak/src/` |
|---|---|
| `linebreak.ts` | `linebreak.ts` |
| `traceback.ts` | `traceback.ts` |
| `nodes.ts` | `nodes.ts` |
| `compose.ts` | `compose.ts` |
| `hyphenate.ts` | `hyphenate.ts` |

New file: `1a-linebreak/src/index.ts` — barrel export of public API (see below).

---

## Test files to move

| From `1-knuth-plass/tests/` | To `1a-linebreak/tests/` |
|---|---|
| `linebreak.test.ts` | `linebreak.test.ts` |
| `nodes.test.ts` | `nodes.test.ts` |
| `compose.test.ts` | `compose.test.ts` |
| `hyphenate.test.ts` | `hyphenate.test.ts` |

Update imports inside each test: `../src/...` → package-local `../src/...` (same relative path, just new location).

---

## Subtasks

### 1a — Scaffold the package
- [ ] Create `1a-linebreak/package.json`
  - name: `@paragraf/linebreak`
  - deps: `@paragraf/types`, `hyphen`
  - devDeps: `typescript`, `vitest`
- [ ] Create `1a-linebreak/tsconfig.json` (mirror `0-types/tsconfig.json`)
- [ ] Create `1a-linebreak/vitest.config.ts` (mirror `1-knuth-plass/vitest.config.ts`)
- [ ] Add `"1a-linebreak"` to root `package.json` workspaces array

### 1b — Move source files and fonts
- [ ] Move `linebreak.ts`, `traceback.ts`, `nodes.ts`, `compose.ts`, `hyphenate.ts` to `1a-linebreak/src/`
- [ ] Create `1a-linebreak/src/index.ts` barrel (see Public API below)
- [ ] Move `1-knuth-plass/fonts/` to `/paragraf/fonts/` (monorepo root)
- [ ] Verify no imports inside these files reference anything outside the group or `@paragraf/types`

### 1c — Update `1-knuth-plass`
- [ ] In `paragraph.ts`: change all imports from the moved files to `from '@paragraf/linebreak'`
- [ ] Add `"@paragraf/linebreak": "*"` to `1-knuth-plass/package.json` dependencies
- [ ] Delete the moved source files from `1-knuth-plass/src/`

### 1d — Move and fix tests
- [ ] Move the 4 test files to `1a-linebreak/tests/`
- [ ] Update font fixture paths: `../fonts/` → `../../fonts/` (monorepo root)
- [ ] Run `npm test` inside `1a-linebreak/` — all moved tests pass standalone

### 1e — Verify and commit
- [ ] Run `npm test` inside `1-knuth-plass/` — remaining tests still pass
- [ ] Run `npm install` at monorepo root to verify workspace links
- [ ] Commit: `"extract @paragraf/linebreak"`

---

## Public API (`1a-linebreak/src/index.ts`)

```ts
// Algorithm
export { computeBreakpoints } from './linebreak';
export { traceback, LineBreak } from './traceback';
export { buildNodeSequence, HyphenatedWordWithFont } from './nodes';
export { composeParagraph } from './compose';

// Hyphenation
export { hyphenate, HyphenateOptions, DEFAULT_HYPHENATE_OPTIONS } from './hyphenate';
```

Types (`Node`, `Box`, `Glue`, `Penalty`, `BreakpointNode`, `Paragraph`, `ComposedLine`, etc.) are not re-exported here — callers import them directly from `@paragraf/types`.

---

## Font fixtures

Font files move to `/paragraf/fonts/` (monorepo root). Tests reference them as `../../fonts/<filename>`.
The existing `1-knuth-plass/fonts/` is moved — not copied — during subtask 1b.
