# Step 8.5 — Pre-publish Bug Fixes & Hardening

This step sits between the manual test suite (Step 8) and the build/publish pipeline
(Step 9). It addresses correctness bugs, publish blockers, and architecture gaps
identified in the post-Step-8 code review.

---

## Open decisions (must resolve before coding)

### Decision 1 — Module-level singleton caches

**The problem:**
`metricsCache` in `render.ts` and `upmCache` in `pdf.ts` are process-level `Map`
singletons. They cache by `fontId` only. If the same `fontId` is loaded with
different font bytes (possible in tests, possible on a server that hot-reloads
fonts), the cache returns stale data silently.

**Option A — Accept and document**
Add a JSDoc comment on each cache explaining the limitation:
> "Cache is process-scoped. Do not reuse fontIds across different font binaries
> in the same process."
No code change. Zero risk. Acceptable for v0.x where font registries are
typically immutable at runtime.

**Option B — Make caches instance-scoped**
Move each cache inside its owning function/class so each call site gets a fresh
cache. For `layoutParagraph` (a pure function) this means accepting a cache
object as an optional parameter, or introducing a `Renderer` class.
More correct but breaks the pure-function API surface of `layoutParagraph`.

**Option C — Weak registry invalidation**
Add a `clearMetricsCache()` export that tests can call in `beforeEach`.
Simple, surgical, doesn't change the public API shape.

**Recommendation:** Option C for now — one export per module, call it in test
`beforeEach` where needed. Option B deferred to post-v0.3.0 if server use
cases demand it.

---

### Decision 2 — `dispose()` on `ParagraphComposer`

**The problem:**
`hyphenatorCache` and font-related state inside `createParagraphComposer` grow
for the process lifetime. In long-running Node servers (batch PDF processor use
case), this is a memory leak since there is no way to release resources.

**Option A — `dispose()` flushes hyphenator cache only**
```ts
composer.dispose(); // clears hyphenatorCache, not font caches
```
Safe — font caches are shared and can't be cleared without risk to other
composers. The hyphenator cache holds language dictionaries (~50KB each).
Disposing clears those. Font bytes stay in the registry (caller-owned).

**Option B — `dispose()` flushes everything including module-level font caches**
Requires coordination: if two composer instances share the same registry, one
calling `dispose()` invalidates the other's font data. Risky without reference
counting.

**Option C — No dispose, document memory model**
Document that `createParagraphComposer` is intended to be a long-lived singleton
per font registry. Callers who need to free memory should let the object go
out of scope and rely on GC.

**Recommendation:** Option A — `dispose()` that clears only `hyphenatorCache`.
Clean, safe, signals intent to the caller. Add a note that font registry memory
is caller-owned.

---

### Decision 3 — CI synthetic font fixture

**The problem:**
E2E tests load real font files (`Liberation Serif`, `Roboto`) from `fonts/`.
These aren't committed (file size + licensing). In CI, the entire E2E suite
throws a synchronous `file not found` error rather than skipping gracefully.
There is no CI configuration (no `.github/`, no Makefile).

**Option A — Commit a minimal synthetic TTF**
Generate a ~10KB minimal TTF covering ASCII (256 glyphs) using `fonttools` or
a similar tool. Commit it to `tests/fixtures/fonts/`. E2E tests use this font.
Fully automated, no licensing concerns.

**Option B — Use a permissive open-source font**
Pick one freely licensed font (e.g. Cascadia Code MIT, Noto Sans OFL) and
commit it. Simpler than generating one — just download and commit.
Real-world glyph metrics make tests more meaningful.

**Option C — Skip E2E tests when fonts are absent**
Wrap the `beforeAll` in a file-existence check and call `vi.skip()` when fonts
are missing. No font committed, no CI. Keeps the suite green in CI but
provides no visual correctness verification.

**Recommendation:** Option B — commit one small permissive font (Cascadia Code
is 400KB, or Noto Sans Mono which is ~300KB). Real metrics, zero licensing risk,
runnable in CI immediately. Then add a minimal GitHub Actions workflow
(`.github/workflows/ci.yml`) that runs `npm test` on push.

---

## Phase A — Correctness fixes (4 tasks)

### A1 — WASM last-line ratio epsilon bug
**File:** `1a-linebreak/tests/equivalence.test.ts` + `1a-linebreak/src/traceback.ts`

The WASM binary serializes `Infinity` → `1e30`. After prefix-sum accumulation,
the forced-break last line has `totalStretch = 1e30`. `compute_ratio` returns
`target / 1e30 ≈ 1e-28` instead of exactly `0`.

Any E2E test asserting `expect(ratio).toBe(0)` on the last line will fail when
WASM is active.

**Fix:**
1. In `tracebackWasmBinary`: after computing each line ratio, clamp it to `0`
   when the break node is `type: 'penalty'` with `penalty === FORCED_BREAK`.
2. In E2E test: change `toBe(0)` → `toBeCloseTo(0, 10)` as a secondary guard.

---

### A2 — RTL spans: throw instead of warn+proceed
**File:** `3a-typography/src/paragraph.ts`

Current code:
```ts
if (spans && spans.length > 0) {
  console.warn('[knuth-plass] BiDi: spans input is not supported for RTL...');
}
```
After the warn, execution continues with the wrong input (span text concatenated
as single-font). Output is silently incorrect for any Arabic/Hebrew caller
passing `spans`.

**Fix:** Replace with:
```ts
if (spans && spans.length > 0) {
  throw new Error(
    '[paragraf] RTL paragraphs do not support span input yet. ' +
    'Use plain `text` input for RTL content.'
  );
}
```
Add a test asserting this throws.

---

### A3 — Unicode safety in `mapFragmentsToSegments`
**File:** `3a-typography/src/paragraph.ts`

`String.prototype.length` counts UTF-16 code units. Astral plane characters
(emoji, supplementary CJK, extended Arabic) have `length === 2` per character.
Hyphenation fragment boundaries measured by `.length` will drift from actual
grapheme positions for any segment containing such characters.

**Fix:** Replace `.length` with `[...text].length` at every index arithmetic
site inside `mapFragmentsToSegments`. This iterates Unicode code points, not
UTF-16 units.

Locate all:
```ts
seg.text.length
charIdx += fragment.length
avail = seg.text.length - charIdx
```
and replace with spread-length equivalents.

---

### A4 — `composeDocument` multi-frame width footgun
**File:** `3a-typography/src/document.ts`

`composeDocument` always derives `textWidth` from `frames[0]`:
```ts
const textWidth = firstFrame ? colWidth(firstFrame) : 0;
```
A document with a wide intro frame (frame 0: 500pt) followed by a narrow
two-column frame (frame 1: 240pt per column) composes all paragraphs at 500pt,
then tries to lay 500pt-wide lines into 240pt columns. Lines overflow silently.

**Fix:** Add a warning when frame column widths differ and `deriveLineWidths`
was not called:
```ts
const widths = frames.map(f => colWidth(f));
const allSame = widths.every(w => w === widths[0]);
if (!allSame) {
  console.warn(
    '[paragraf] composeDocument: frames have different column widths. ' +
    'All paragraphs will be composed at frame[0] width (' + widths[0] + 'pt). ' +
    'Call deriveLineWidths() to assign per-paragraph widths explicitly.'
  );
}
```

---

## Phase B — Publish blockers (Step 9 prerequisites)

These are resolved as part of the Step 9 build pipeline task, documented here
for completeness.

### B1 — Add `files` field to every `package.json`
Every package currently publishes everything including `tests/`, `scripts/`,
`tsconfig.json`. The `files` field must be added to restrict to `dist/` and
any necessary extras (e.g. `wasm/pkg/` for `2a-shaping-wasm`).

Example:
```json
"files": ["dist/", "README.md"]
```

### B2 — `exports` map pointing at `dist/`
Currently all packages point `exports["."]` at `./src/index.ts`. After the
`tsup` build, this must change to:
```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

### B3 — `2a-shaping-wasm` WASM binary in publish output
The pre-compiled `.wasm` file lives in `wasm/pkg/`. It must be included in
`files` and the WASM binary path must survive the `tsup` build step.
`tsup` loader config: `loader: { '.wasm': 'binary' }` or copy via `tsup`
`onSuccess` hook.

### B4 — Version all packages to `0.3.0`
Lockstep versioning. All `package.json` files move from `0.1.0` → `0.3.0`
before first publish. Reasoning: `0.1.0` signals "barely started", `0.3.0`
signals "pre-release but intentional".

### B5 — `dispose()` on `ParagraphComposer`
*See Decision 2 above.* Implement Option A.

---

## Phase C — Post-publish hardening (after Step 9)

### C1 — CI setup + synthetic font fixture
*See Decision 3 above.* Implement Option B.
- Commit one permissive font to `tests/fixtures/fonts/`
- Add `.github/workflows/ci.yml` running `npm test` on push and PR

### C2 — Singleton cache `clearMetricsCache()` exports
*See Decision 1 above.* Implement Option C.
- `render.ts`: export `clearMetricsCache()`
- `pdf.ts`: export `clearUpmCache()`
- Call both in `beforeEach` in relevant test files

### C3 — `getUnitsPerEm` dedicated FontEngine method
`getUnitsPerEm` in `render.ts` calls `getFontMetrics(fontId, fontSize)` just to
extract `unitsPerEm` — a font-level property that does not vary with `fontSize`.
Add `getUnitsPerEm(fontId: string): number` to the `FontEngine` interface in
`1b-font-engine`, implement in `FontkitEngine` and `WasmEngine`, update call
sites.

### C4 — `ParagraphInput` type-level mutual exclusion
`text` is typed `optional` but functionally required when `spans` is absent.
A caller omitting both gets a silent empty paragraph.

**Fix:** Change the type to a discriminated union:
```ts
type ParagraphInput =
  | { text: string; spans?: never; font: Font; lineWidth: number; ... }
  | { text?: never; spans: TextSpan[]; font: Font; lineWidth: number; ... };
```
This makes the omission a compile-time error.

---

## Items explicitly deferred to roadmap

| Issue | Reason |
|---|---|
| PDF vector-only (no text layer/search) | Architectural tradeoff, documented |
| Font subsetting | Significant effort, PDF/X conformance concern, post-v0.3 |
| RTL glyph-level letter spacing | Feature gap, not a regression |
| `0-color` wiring into `renderToPdf` | Pending color pipeline design |
| `gamma 2.2` approximation in `0-color` | Only matters for PDF/X-3, post-v0.3 |
| Hyphenation memory pressure / `unloadHyphenator` | Observed but low priority |
| Mixed-font word spacing weighted average | Complex, documented limitation |
| Duplicate font cache (measure.ts + FontkitEngine) | Low severity, consolidate in refactor |
| `enforceMinBoundaries` two-path fragility | Not a current bug, add comment |

---

## Execution order

```
Phase A  →  Phase B (= Step 9)  →  Phase C  →  Step 10 (docs)
```

Phase A tasks are independent of each other and can be done in parallel.
Phase B tasks are ordered internally (B1→B2→B3 must precede B4 publish).
Phase C tasks are independent and can be done in any order after Step 9.
