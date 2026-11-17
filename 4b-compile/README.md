# @paragraf/compile

> Document compile pipeline for the paragraf typesetter — merges a `Template`, data record, fonts, layout, and styles into a PDF, SVG, or rendered document model.

## Installation

```bash
npm install @paragraf/compile
```

Requires Node.js 22 or later.

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
      lineHeight: 32,
    },
    body: {
      font: { family: 'Source Serif 4', size: 11 },
      alignment: 'justified',
      lineHeight: 16,
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
| `onOverflow` | `'silent' \| 'throw'` | `'throw'` | Behaviour when content overflows the page count limit. |
| `onInfeasible` | `'overfull' \| 'throw'` | `'overfull'` | Behaviour when a paragraph cannot be set within its tolerance (for example a long number wider than the column; since v0.7.1 URLs and German nouns have break points). `'overfull'` produces the document and lists lines that stick out in `metadata.overfullLines`; `'throw'` throws. |
| `shaping` | `'auto' \| 'wasm' \| 'fontkit'` | `'auto'` | Font shaping engine. `'auto'` uses WASM when available, otherwise fontkit with one warning. `'wasm'` throws when the WASM shaper is not built. `'fontkit'` always uses fontkit. With `session`, the session's engine is used; `'wasm'` then throws if the session is not on WASM. |
| `title` | `string` | — | PDF document title (Info dict). |
| `lang` | `string` | — | BCP 47 language tag (PDF Info dict). |
| `selectable` | `boolean` | `false` | Add invisible text layer for copy-paste (PDF only). |
| `outputIntent` | `OutputIntent` | — | ICC output intent to embed in the PDF (PDF only). Build one with `createColorManager().getOutputIntent()` from `@paragraf/color`. |
| `pdfxConformance` | `'PDF/X-3:2002' \| 'PDF/X-3:2003'` | — | Add PDF/X-3 markers to the PDF. Needs `outputIntent`. |
| `maxPages` | `number` | `100` | Maximum pages to generate. Content beyond it is an overflow: see `onOverflow`. |
| `session` | `CompilerSession` | — | Reuse fonts, composer and font engine from `createCompilerSession()`. |
| `verbose` | `boolean` | `true` | `false` suppresses most non-critical `console.warn` output, including the fontkit fallback warning and the overfull-line warning. Two warnings are always printed: an unknown font variant key in the template, and `pdfxConformance` set without `outputIntent`. |

#### `CompileResult`

```ts
interface CompileResult {
  data: Buffer | string | RenderedDocument;
  metadata: {
    pageCount: number;
    overflowLines: number;          // lines dropped due to maxPages limit
    overfullLines: Array<{          // lines wider than their frame
      paragraph: number;            //   index of the composed paragraph, from 0
      line: number;                 //   index of the line in that paragraph
      overflow: number;             //   points past the right edge
      text: string;                 //   the words on the line
    }>;
    fallbackParagraphs: number[];   // paragraphs that could not be set within tolerance
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
| `signal` | `AbortSignal` | — | When aborted, records that have not started are not started and `compileBatch` rejects with an `AbortError`. |

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

### `createCompilerSession(template, options?)`

Loads the template's fonts and creates the composer and font engine once. Pass the session to `compile()` or `compileBatch()` when the same template is compiled many times.

```ts
import { compile, createCompilerSession } from '@paragraf/compile';

const session = await createCompilerSession(template, { shaping: 'wasm' });

for (const record of records) {
  const { data } = await compile({ template, data: record, session });
  // ...
}
```

#### `SessionOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `basePath` | `string` | `process.cwd()` | Base directory for resolving relative font paths. |
| `shaping` | `'auto' \| 'wasm' \| 'fontkit'` | `'auto'` | Font shaping engine, as for `compile()`. `'wasm'` throws when the WASM shaper is not built or failed to load. |
| `verbose` | `boolean` | `true` | `false` lets `shaping: 'auto'` fall back to fontkit without printing the warning. |

`session.shapingEngine` is `'wasm'` or `'fontkit'`: the engine every compile with this session uses.

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

## Known limitations

See [Known limitations](https://github.com/kadetr/paragraf#known-limitations) in the repository README. One more applies to this package: a style's `features` (OpenType feature tags) is accepted but has no effect yet.

---

## License

MIT
