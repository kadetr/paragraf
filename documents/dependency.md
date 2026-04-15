# Package Dependencies

## Direct dependencies per package

| Package | npm name | Direct `@paragraf/*` deps | Direct third-party deps |
|---|---|---|---|
| `0-types` | `@paragraf/types` | — | — |
| `0-color` | `@paragraf/color` | — | — |
| `1a-linebreak` | `@paragraf/linebreak` | `types` | `hyphen` |
| `1b-font-engine` | `@paragraf/font-engine` | `types` | `fontkit` |
| `1c-layout` | `@paragraf/layout` | `types` | — |
| `1d-style` | `@paragraf/style` | `types` | — |
| `2a-shaping-wasm` | `@paragraf/shaping-wasm` | `types`, `font-engine` | — |
| `2b-render-core` | `@paragraf/render-core` | `types`, `font-engine` | — |
| `3a-typography` | `@paragraf/typography` | `types`, `linebreak`, `font-engine`, `shaping-wasm`, `render-core` | — |
| `3b-render-pdf` | `@paragraf/render-pdf` | `types`, `font-engine`, `render-core` | `pdfkit` |
| `4a-template` | `@paragraf/template` | `types`, `layout`, `style` | — |
| `4b-compile` | `@paragraf/compile` | `types`, `layout`, `style`, `template`, `font-engine`, `typography`, `render-core`, `render-pdf` | — |

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

### `@paragraf/layout`

Page geometry, unit converters, and named paper sizes.

```
npm install @paragraf/layout
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/layout` | direct |

Browser-safe. No font or WASM dependencies.

---

### `@paragraf/style`

Paragraph and character style definitions with inheritance resolution.

```
npm install @paragraf/style
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/style` | direct |

Browser-safe. No font or WASM dependencies.

---

### `@paragraf/color`

ICC color management utilities.

```
npm install @paragraf/color
```

| Package | Source |
|---|---|
| `@paragraf/color` | direct |

Browser-safe. No dependencies at all.

---

### `@paragraf/template`

Document schema and content slot definitions.

```
npm install @paragraf/template
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/layout` | transitive |
| `@paragraf/style` | transitive |
| `@paragraf/template` | direct |

---

### `@paragraf/compile`

High-level document compile pipeline. Merges template, data, fonts, layout, and
styles into a rendered PDF, SVG, or document model in one call.

```
npm install @paragraf/compile
```

| Package | Source |
|---|---|
| `@paragraf/types` | transitive |
| `@paragraf/linebreak` | transitive |
| `@paragraf/font-engine` | transitive |
| `@paragraf/shaping-wasm` | transitive |
| `@paragraf/render-core` | transitive |
| `@paragraf/typography` | transitive |
| `@paragraf/render-pdf` | transitive |
| `@paragraf/layout` | transitive |
| `@paragraf/style` | transitive |
| `@paragraf/template` | transitive |
| `@paragraf/compile` | direct |
| `fontkit` | transitive |
| `hyphen` | transitive |
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

- **`@paragraf/compile`** is the highest-level entry point and pulls in the
  entire stack (typography, render-core, render-pdf, template, layout, style).
  Use it when you want a single `compile()` call rather than assembling the
  pipeline manually.
