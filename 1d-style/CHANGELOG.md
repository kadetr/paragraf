# Changelog

## 0.4.0 — Initial release

- `defineStyles` factory with `StyleRegistry` (paragraph style inheritance, field-by-field font merging, circular dependency detection)
- `defineCharStyles` factory with `CharStyleRegistry` (flat character overrides)
- Types: `FontSpec`, `ParagraphStyleDef`, `CharStyleDef`, `ResolvedParagraphStyle`, `ResolvedCharStyle`
- Built-in defaults: family `''`, size `10`, weight `400`, style `'normal'`, language `'en-us'`, alignment `'justified'`, lineHeight `14`, hyphenation `true`, all spacings `0`, tolerance `2`, looseness `0`
