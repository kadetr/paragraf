# Package Dependencies

## Direct dependencies per package

| Package | npm name | Direct `@paragraf/*` deps | Direct third-party deps |
|---|---|---|---|
| `0-types` | `@paragraf/types` | — | — |
| `0-color` ¹ | `@paragraf/color` | — | — |
| `1a-linebreak` | `@paragraf/linebreak` | `types` | `hyphen` |
| `1b-font-engine` | `@paragraf/font-engine` | `types` | `fontkit` |
| `2a-shaping-wasm` | `@paragraf/shaping-wasm` | `types`, `font-engine` | — |
| `2b-render-core` | `@paragraf/render-core` | `types`, `font-engine` | — |
| `3a-typography` | `@paragraf/typography` | `types`, `linebreak`, `font-engine`, `shaping-wasm`, `render-core` | — |
| `3b-render-pdf` | `@paragraf/render-pdf` | `types`, `font-engine`, `render-core` | `pdfkit` |

¹ `0-color` has no `@paragraf/*` dependencies — it is a pure utility package at layer 0, alongside `0-types`.

---

## What gets installed per use case

npm resolves transitive dependencies automatically. The table below shows what
lands in `node_modules` when you install each package.

### `@paragraf/types`

```
npm install @paragraf/types
```

| Package | Source |
|---|---|
| `@paragraf/types` | direct |

No third-party deps. Safe for any environment.

---

### `@paragraf/linebreak`

```
npm install @paragraf/linebreak
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/linebreak` | direct |
| `hyphen` | transitive |

Browser-safe. No font or WASM dependencies.

---

### `@paragraf/font-engine`

```
npm install @paragraf/font-engine
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/font-engine` | direct |
| `fontkit` | transitive |

---

### `@paragraf/shaping-wasm`

```
npm install @paragraf/shaping-wasm
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/shaping-wasm` | direct |
| `fontkit` | transitive |

Adds the Rust/WASM shaping backend on top of `font-engine`.

---

### `@paragraf/render-core`

```
npm install @paragraf/render-core
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/render-core` | direct |
| `fontkit` | transitive |

Canvas/SVG output. Browser-safe.

---

### `@paragraf/typography`

Full compositor: Knuth-Plass line breaking, WASM shaping, optical margin
alignment, multi-frame/multi-page document model.

```
npm install @paragraf/typography
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/linebreak` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/shaping-wasm` | transitive |
| `@paragraf/render-core` | transitive |
| `@paragraf/typography` | direct |
| `fontkit` | transitive |
| `hyphen` | transitive |

---

### `@paragraf/render-pdf`

PDF output via pdfkit. Node-only — does not depend on `@paragraf/typography`.
Can be used alongside render-core without the full compositor.

```
npm install @paragraf/render-pdf
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/render-core` | transitive |
| `@paragraf/render-pdf` | direct |
| `fontkit` | transitive |
| `pdfkit` | transitive |

---

### Full pipeline (typography + PDF output)

```
npm install @paragraf/typography @paragraf/render-pdf
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/linebreak` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/shaping-wasm` | transitive |
| `@paragraf/render-core` | transitive |
| `@paragraf/typography` | direct |
| `@paragraf/render-pdf` | direct |
| `fontkit` | transitive |
| `hyphen` | transitive |
| `pdfkit` | transitive |

---

## Notes

- **`fontkit`** is the heaviest transitive dependency. It enters the tree as soon as
  you install anything from layer 1b onward. If you only need `@paragraf/linebreak`
  (e.g. pure line-breaking in a browser), `fontkit` is not pulled in.

- **`hyphen`** (hyphenation dictionaries) is only pulled in through `@paragraf/linebreak`.

- **`pdfkit`** is Node-only. Do not use `@paragraf/render-pdf` in browser builds.

- **`@paragraf/shaping-wasm`** ships a compiled Rust/WASM binary. The WASM
  engine is loaded lazily and falls back gracefully if unavailable.
