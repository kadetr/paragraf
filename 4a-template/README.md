# @paragraf/template

Document schema and content slot definitions for the [paragraf](https://github.com/kadetr/paragraf) typesetter. Browser-safe — pure data types and validation, no I/O, no rendering.

## Installation

```bash
npm install @paragraf/template
```

## Quick start

```ts
import { defineTemplate } from '@paragraf/template';

const invoiceTemplate = defineTemplate({
  layout: {
    size:    'A4',
    margins: { top: '20mm', right: '20mm', bottom: '20mm', left: '25mm' },
    columns: 1,
    bleed:   '3mm',
  },

  fonts: {
    SourceSerif4: {
      regular:    './fonts/SourceSerif4-Regular.ttf',
      bold:       './fonts/SourceSerif4-Bold.ttf',
      italic:     './fonts/SourceSerif4-Italic.ttf',
      boldItalic: './fonts/SourceSerif4-BoldItalic.ttf',
    },
  },

  styles: {
    defaults: {
      font:        { family: 'SourceSerif4', size: 10, weight: 400 },
      language:    'en-us',
      lineHeight:  14,
      hyphenation: true,
    },
    'product-name': {
      extends:   'defaults',
      font:      { size: 16, weight: 'bold' },
      alignment: 'left',
    },
    body: {
      extends:   'defaults',
      alignment: 'justified',
      spaceAfter: 4,
    },
    caption: {
      extends: 'body',
      font:    { size: 8 },
    },
  },

  content: [
    {
      style: 'product-name',
      text:  '{{product.name}}',
    },
    {
      style:       'body',
      text:        '{{product.description}}',
      onMissing:   'fallback',
      fallbackText: 'No description available.',
    },
    {
      style:     'caption',
      text:      'Article: {{product.sku}}',
      onMissing: 'skip',
    },
  ],
});

// Pass to @paragraf/compile:
// const pdf = await compile({ template: invoiceTemplate, data: productRecord, output: 'pdf' });
```

## Interpolation syntax

Content slot `text` fields support `{{path.to.field}}` bindings. Multiple bindings and mixed literal+binding strings are supported:

```ts
'{{product.name}}'                      // pure binding
'Article: {{product.sku}}'             // mixed
'{{first}} {{last}}'                    // two bindings
'{{items.0.price}}'                     // array index
'Static heading text'                   // no binding (also valid)
```

Binding paths must be dot-separated identifiers. Syntax is validated at `defineTemplate()` call time; values are resolved at compile time by `@paragraf/compile`.

## Missing field handling

```ts
content: [
  { style: 'body', text: '{{field}}', onMissing: 'skip' },        // omit slot
  { style: 'body', text: '{{field}}', onMissing: 'placeholder' }, // compile fills in a placeholder
  {
    style:        'body',
    text:         '{{field}}',
    onMissing:    'fallback',
    fallbackText: 'Not available',                                 // rendered as-is
  },
]
```

`onMissing` defaults to `'skip'` when not set.

## Dimension strings

`TemplateLayout` accepts Dimension values for margins, gutter, and bleed. These are resolved to points by `@paragraf/compile` via `parseDimension()` from `@paragraf/layout`.

```ts
margins: '20mm'                                                    // equal all sides
margins: 36                                                        // points, equal all sides
margins: { top: '20mm', right: '15mm', bottom: '20mm', left: '25mm' }
gutter:  '5mm'
bleed:   '3mm'
```

Supported unit suffixes: `mm`, `cm`, `in`, `pt`, `px`.

## Font variants

```ts
fonts: {
  Serif: {
    regular:    './fonts/Serif-Regular.ttf',    // standard variant keys
    bold:       './fonts/Serif-Bold.ttf',
    italic:     './fonts/Serif-Italic.ttf',
    boldItalic: './fonts/Serif-BoldItalic.ttf',
    light:      './fonts/Serif-Light.ttf',      // custom variant keys also allowed
    semiBold:   './fonts/Serif-SemiBold.ttf',
  },
}
```

File path resolution (relative vs absolute) is handled by `@paragraf/compile`.

---

## API

### `defineTemplate(input)`

Validates a `Template` object and returns it unchanged. Throws with a descriptive message if:
- style inheritance chains have cycles or missing `extends`/`next` references
- a content slot's `style` is not defined in `template.styles`
- a content slot has `onMissing: 'fallback'` but no `fallbackText`
- a content slot's `text` has malformed `{{...}}` syntax

### `parseTokens(text)`

Parse a content slot's text string into an array of `Token` objects. Useful for `@paragraf/compile` when resolving bindings against a data record.

```ts
parseTokens('Article: {{product.sku}}')
// → [{ type: 'literal', value: 'Article: ' }, { type: 'binding', path: 'product.sku' }]
```

---

### `Template` fields

| Field | Type | Description |
|---|---|---|
| `layout` | `TemplateLayout` | Page geometry configuration |
| `fonts` | `TemplateFonts` | Font family declarations |
| `styles` | `Record<string, ParagraphStyleDef>` | Paragraph style definitions (same shape as `@paragraf/style`'s `defineStyles()` input) |
| `content` | `ContentSlot[]` | Ordered list of content slots |

### `TemplateLayout` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `size` | `PageSizeName \| [number, number]` | — | Named page size or `[width, height]` in points |
| `margins` | `Dimension \| DimensionMargins` | — | Equal margin or per-side object |
| `columns` | `number` | `1` | Number of text columns |
| `gutter` | `Dimension` | `0` | Space between columns |
| `bleed` | `Dimension` | `0` | Bleed on all four sides |

### `ContentSlot` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `style` | `string` | — | Style name from `template.styles` |
| `text` | `string` | — | Literal text or `{{binding.path}}` template string |
| `onMissing` | `OnMissing` | `'skip'` | Behaviour when a binding resolves to missing |
| `fallbackText` | `string` | — | Required when `onMissing` is `'fallback'` |

### `Token` (from `parseTokens`)

```ts
type Token =
  | { type: 'literal'; value: string }
  | { type: 'binding'; path: string };   // path is dot-notation, e.g. 'product.name'
```

---

## Notes

- **No file I/O** — `@paragraf/template` does not read font files. Path resolution and font loading are handled by `@paragraf/compile`.
- **No rendering** — this package is geometry and schema only. Passing a validated template to `@paragraf/compile` triggers the full typography pipeline.
- **Styles are the same shape as `@paragraf/style`** — you can define and test styles independently with `defineStyles()` from `@paragraf/style`, then use the same definitions object in your template.
- **Dimension resolution happens at compile time** — `TemplateLayout` stores human-readable strings; `@paragraf/compile` calls `parseDimension()` from `@paragraf/layout` before constructing `PageLayout`.

## Layer

`@paragraf/template` is **Layer 4** in the paragraf stack.

```
Layer 0   @paragraf/types
Layer 1   @paragraf/layout  @paragraf/style
Layer 4   @paragraf/template   ← this package
```
