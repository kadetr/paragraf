# @paragraf/style

Paragraph and character style definitions with inheritance resolution for the [paragraf](https://github.com/kadetr/paragraf) typography library.

Pure data — no font loading, no measurement, no rendering. Define named styles with optional inheritance, resolve them to flat objects ready for the compositor.

## Installation

```bash
npm install @paragraf/style
```

## Quick start

```ts
import { defineStyles, defineCharStyles } from '@paragraf/style';

const styles = defineStyles({
  defaults: {
    font:        { family: 'SourceSerif4', size: 10, weight: 400, style: 'normal' },
    language:    'en-us',
    alignment:   'justified',
    lineHeight:  14,
    hyphenation: true,
  },
  body: {
    extends:     'defaults',
    spaceBefore: 0,
    spaceAfter:  4,
  },
  heading: {
    extends:     'defaults',
    font:        { size: 18, weight: 700 },   // family inherited from defaults
    alignment:   'left',
    spaceBefore: 18,
    spaceAfter:  8,
    hyphenation: false,
    next:        'body',
  },
  caption: {
    extends:   'body',
    font:      { size: 8 },     // family + weight inherited through body → defaults
    alignment: 'left',
  },
});

const heading = styles.resolve('heading');
heading.font.family     // 'SourceSerif4' — inherited from defaults
heading.font.size       // 18
heading.hyphenation     // false
heading.next            // 'body'

const caption = styles.resolve('caption');
caption.font.size       // 8
caption.spaceAfter      // 4 — inherited from body
```

## `resolve()` usage

```ts
const resolved = styles.resolve('body');
// resolved.font is Required<FontSpec> — all fields present after resolution
// resolved.alignment, .lineHeight, .hyphenation, etc. are all non-optional
```

## Character styles

```ts
const chars = defineCharStyles({
  emphasis:  { font: { style: 'italic' } },
  bold:      { font: { weight: 700 } },
  highlight: { color: '#ffff00' },
});

chars.resolve('emphasis').font.style    // 'italic'
chars.resolve('highlight').color        // '#ffff00'
```

---

## API

### `defineStyles(defs)`

Creates a `StyleRegistry` from a map of named `ParagraphStyleDef` objects. Validates all `extends` references and throws if a referenced style does not exist or if circular inheritance is detected.

### `StyleRegistry`

| Method | Description |
|---|---|
| `resolve(name)` | Returns a fully-resolved `ResolvedParagraphStyle`. Throws if name not found. |
| `get(name)` | Returns the raw (unresolved) `ParagraphStyleDef`, or `undefined`. |
| `names()` | Returns all defined style names. |

### `defineCharStyles(defs)`

Creates a `CharStyleRegistry` from a map of named `CharStyleDef` objects. No inheritance — char styles are flat overrides.

### `CharStyleRegistry`

| Method | Description |
|---|---|
| `resolve(name)` | Returns a `ResolvedCharStyle`. Throws if name not found. |
| `names()` | Returns all defined char style names. |

---

### `ParagraphStyleDef` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `extends` | `string` | — | Name of parent style in the same registry |
| `font` | `FontSpec` | — | Merged field-by-field with parent |
| `language` | `Language` | `'en-us'` | Hyphenation language |
| `alignment` | `AlignmentMode` | `'justified'` | Text alignment |
| `lineHeight` | `number` | `14` | Total line height in points |
| `hyphenation` | `boolean` | `true` | Enable hyphenation |
| `spaceBefore` | `number` | `0` | Vertical space above paragraph (pt) |
| `spaceAfter` | `number` | `0` | Vertical space below paragraph (pt) |
| `firstLineIndent` | `number` | `0` | First-line indent (pt) |
| `tolerance` | `number` | `2` | Knuth–Plass tolerance |
| `looseness` | `number` | `0` | Knuth–Plass looseness |
| `next` | `string` | — | Style to apply to the following paragraph |

### `FontSpec` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `family` | `string` | `''` | Font family name; inherited from parent chain if absent |
| `size` | `number` | `10` | Size in points |
| `weight` | `number` | `400` | Weight (100–900) |
| `style` | `FontStyle` | `'normal'` | `'normal'` \| `'italic'` \| `'oblique'` |
| `letterSpacing` | `number` | `0` | Extra tracking in points |

### `CharStyleDef` fields

| Field | Type | Description |
|---|---|---|
| `font` | `Partial<FontSpec>` | Font overrides |
| `color` | `string` | CSS hex/rgb string (stored, not rendered) |
| `letterSpacing` | `number` | Extra tracking override |

---

## Notes

- **No FontId assignment** — `ResolvedParagraphStyle.font.family` is a plain string. The calling layer (`@paragraf/compile`) is responsible for mapping family names to font IDs.
- **Font merging is field-by-field** — a child that sets `font: { size: 18 }` inherits `family`, `weight`, `style`, and `letterSpacing` from its parent chain.
- **Character styles have no inheritance** — they are flat overrides applied on top of the resolved paragraph style.

## License

MIT
