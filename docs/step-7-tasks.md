# Step 7 — Monorepo cleanup

Three housekeeping tasks before the architecture is fully consistent:
1. Rename `paragraf-color` → `@paragraf/color` (package naming inconsistency)
2. Move `e2e.test.ts` to monorepo root `tests/` (per the architecture decision)
3. Fix `2-color/tsconfig.json` — missing `rootDir`

---

## Pre-flight check

- [ ] All tests green: `npm test --workspaces`
- [ ] `git status` clean

---

## Task 1 — Rename `paragraf-color` → `@paragraf/color`

In `2-color/package.json`, change the `name` field:

```diff
-  "name": "paragraf-color",
+  "name": "@paragraf/color",
```

If any other package had `"paragraf-color": "*"` in its dependencies, update those too (currently: none).

---

## Task 2 — Fix `2-color/tsconfig.json`

Add `"rootDir": "."` for consistency with all other packages:

```diff
     "moduleResolution":  "bundler",
+    "rootDir":           ".",
     "strict":            true,
```

---

## Task 3 — Create root `tests/` folder and vitest config

The architecture decision specifies:
> *E2E tests live at the monorepo root in `/paragraf/tests/`*

Create `tests/vitest.config.ts` at the monorepo root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

---

## Task 4 — Move `e2e.test.ts` from `3a-typography/tests/` to `tests/`

```
3a-typography/tests/e2e.test.ts  →  tests/e2e.test.ts
```

**One import change**: `FONTS_DIR` path moves up one level:

```diff
-const FONTS_DIR = path.resolve(__dirname, '../../fonts');
+const FONTS_DIR = path.resolve(__dirname, '../fonts');
```

All other imports are already cross-package (`@paragraf/typography`, `@paragraf/types`) — no changes needed.

Delete `3a-typography/tests/e2e.test.ts` after copying.

---

## Task 5 — Add root `test:e2e` script

In root `package.json`, add a script:

```diff
+  "scripts": {
+    "test:e2e": "vitest run --config tests/vitest.config.ts"
+  },
   "workspaces": [ ... ]
```

The e2e test resolves `@paragraf/typography` and `@paragraf/types` via the workspace symlinks in `node_modules/` — no extra config needed.

---

## Task 6 — `npm install` + verify

```bash
npm install
npm test --workspaces          # all package tests still pass
npm run test:e2e               # e2e passes from root
```

Expected:
- `3a-typography`: drops from 174 → 159 tests (e2e removed)
- Root e2e: 15 tests pass
- All other packages: unchanged
- Total across packages unchanged; e2e now runs independently

---

## Task 7 — Commit

```bash
git add -A
git commit -m "rename @paragraf/color, move e2e to root, cleanup"
```

---

## What this achieves

- All 8 packages use the `@paragraf/` scope consistently
- Architecture decision for monorepo-root e2e is now implemented
- `2-color/tsconfig.json` consistent with all other packages
- `rootDir` in every tsconfig ✅
