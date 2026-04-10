# @paragraf/compile

> Document compile pipeline for the paragraf typesetter — merges a `Template`, data record, fonts, layout, and styles into a PDF, SVG, or rendered document model.

## Installation

```bash
npm install @paragraf/compile
```

## Quick start

```ts
import { compile } from '@paragraf/compile';
import { defineTemplate } from '@paragraf/template';

const template = defineTemplate({
  layout: { size: 'A4', margins: 72 },
  fonts: {
    'Source Serif 4': {
      regular:    './fonts/SourceSerif4-Regular.ttf',
      bold:       './fonts/SourceSerif4-Bold.ttf',
      italic:     './fonts/SourceSerif4-Italic.ttf',
      boldItalic: './fonts/SourceSerif4-BoldItalic.ttf',
    },
  },
  styles: {
    heading: {
      font: { family: 'Source Serif 4', size: 24, weight: 700 },
      alignment: 'left',
      lineHeight: 32,  // \u2190 not yet applied (see known limitations)
    },
    body: {
      font: { family: 'Source Serif 4', size: 11 },
      alignment: 'justified',
      lineHeight: 16,  // \u2190 not yet applied (see known limitations)
    },
  },
  content: [
    { style: 'heading', text: '{{product.name}}' },
    { style: 'body',    text: '{{product.description}}' },
  ],
});

const { data, metadata } = await compile({
  template,
  data: { product: { name: 'Widget Pro', description: 'The best widget.' } },
  output: 'pdf',
});

// data is a Buffer containing a valid PDF
console.log(`Generated ${metadata.pageCount} page(s)`);
```

## API

### `compile(options)`

Compiles a single document.

```ts
compile<T = unknown>(options: CompileOptions<T>): Promise<CompileResult>
```

#### `CompileOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `template` | `Template` | required | Validated template from `defineTemplate()`. |
| `data` | `T` | required | Data record to interpolate into content slots. |
| `normalize` | `(raw: T) => Record<string, unknown>` | — | Optional function to reshape `data` before binding. |
| `output` | `'pdf' \| 'svg' \| 'rendered'` | `'pdf'` | Output format. |
| `basePath` | `string` | `process.cwd()` | Base directory for resolving relative font paths. |
| `onOverflow` | `'silent' \| 'throw'` | `'silent'` | Behaviour when content overflows the page count limit. |
| `shaping` | `'auto' \| 'wasm' \| 'fontkit'` | `'auto'` | Font shaping engine. `'auto'` uses WASM when available, falls back to fontkit. |
| `title` | `string` | — | PDF document title (Info dict). |
| `lang` | `string` | — | BCP 47 language tag (PDF Info dict). |
| `selectable` | `boolean` | `false` | Add invisible text layer for copy-paste (PDF only). |
| `maxPages` | `number` | `100` | Maximum pages to generate before truncating. |

#### `CompileResult`

```ts
interface CompileResult {
  data: Buffer | string | RenderedDocument;
  metadata: {
    pageCount: number;
    overflowLines: number;          // lines dropped due to maxPages limit
    shapingEngine: 'wasm' | 'fontkit';
  };
}
```

- `data` is a `Buffer` when `output: 'pdf'`, a `string` when `output: 'svg'`, and a `RenderedDocument` when `output: 'rendered'`.

---

### `compileBatch(options)`

Compiles multiple records concurrently (collect-errors mode — errors on individual records do not abort the batch).

```ts
compileBatch<T = unknown>(options: CompileBatchOptions<T>): Promise<CompileBatchResult<T>[]>
```

#### `CompileBatchOptions`

All `CompileOptions` except `data`, plus:

| Option | Type | Default | Description |
|---|---|---|---|
| `records` | `T[]` | required | Array of records to compile. |
| `concurrency` | `number` | `4` | Maximum number of in-process concurrent compile calls. |
| `onProgress` | `(completed, total) => void` | — | Called after each record finishes. |

#### `CompileBatchResult<T>`

```ts
interface CompileBatchResult<T> {
  record: T;
  index: number;     // position in the original records array
  result?: CompileResult;
  error?: Error;
}
```

---

## Font variant conventions

When a font variant is declared as a plain string path, `@paragraf/compile` resolves the weight and style from the key name using the 18-key convention table. Use the object form to set explicit metadata for custom variants.

| Key | weight | style | | Key | weight | style |
|---|---|---|---|---|---|---|
| `thin` | 100 | normal | | `thinItalic` | 100 | italic |
| `extraLight` | 200 | normal | | `extraLightItalic` | 200 | italic |
| `light` | 300 | normal | | `lightItalic` | 300 | italic |
| `regular` | 400 | normal | | `italic` | 400 | italic |
| `medium` | 500 | normal | | `mediumItalic` | 500 | italic |
| `semiBold` | 600 | normal | | `semiBoldItalic` | 600 | italic |
| `bold` | 700 | normal | | `boldItalic` | 700 | italic |
| `extraBold` | 800 | normal | | `extraBoldItalic` | 800 | italic |
| `black` | 900 | normal | | `blackItalic` | 900 | italic |

Custom keys must use the object form:

```ts
fonts: {
  'Source Serif 4': {
    light:    { path: './SourceSerif4-Light.ttf',   weight: 300 },
    semiBold: { path: './SourceSerif4-SemiBold.ttf', weight: 600 },
  },
},
```

When no exact weight match is found for a style, `@paragraf/compile` selects the nearest weight following CSS font-weight rules and emits a `console.warn`.

---

## Known limitations (v0.5)

- **`lineHeight` on paragraph styles** — the `lineHeight` value in a style definition is not passed to the line compositor. The compositor derives leading from font metrics per line. As a result, adjusting `lineHeight` in a style currently has no effect on the output. Per-line leading control is planned for v0.6 when the compositor gains a `lineHeight` field on `ParagraphInput`.
- **`spaceBefore` / `spaceAfter` on paragraph styles** — per-paragraph spacing is not yet passed to the compositor (the underlying `ParagraphInput` type does not have these fields). Use the frame-level `paragraphSpacing` on `Frame` for uniform spacing. Per-paragraph spacing is planned for v0.6.
- **`hyphenation: false`** — this style property is not yet propagated to the compositor in v0.5.

---

## License

MIT
