// interpolate.ts — parse and validate {{binding.path}} interpolation syntax.

/**
 * A parsed token from a content slot's text field.
 * - literal: static text, rendered as-is.
 * - binding: a data reference resolved at compile time from the data record.
 */
export type Token =
  | { type: 'literal'; value: string }
  | { type: 'binding'; path: string };

// Binding path: one or more dot-separated segments.
// Each segment must be a valid identifier or numeric index.
// Valid:   'name', 'product.sku', 'items.0.price'
// Invalid: '2bad', 'a b', 'a..b', ''
const SEGMENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$|^\d+$/;

function isValidPath(path: string): boolean {
  if (path.length === 0) return false;
  const segments = path.split('.');
  // must open with a non-numeric identifier
  if (!/^[a-zA-Z_$]/.test(segments[0])) return false;
  return segments.every((s) => SEGMENT_RE.test(s));
}

/**
 * Parse a content slot's text string into an array of tokens.
 *
 * - Plain strings produce a single `literal` token.
 * - `'{{product.name}}'` produces a single `binding` token.
 * - `'Article: {{sku}}'` produces `[literal, binding]`.
 * - Multiple `{{...}}` expressions per string are supported.
 *
 * @throws if `{{` has no matching `}}`, the binding path is empty, or the
 *   path is not a valid dot-separated identifier chain.
 */
export function parseTokens(text: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < text.length) {
    const open = text.indexOf('{{', pos);

    if (open === -1) {
      // remainder is a plain literal
      tokens.push({ type: 'literal', value: text.slice(pos) });
      break;
    }

    // flush any literal before the opening {{
    if (open > pos) {
      tokens.push({ type: 'literal', value: text.slice(pos, open) });
    }

    const close = text.indexOf('}}', open + 2);
    if (close === -1) {
      throw new Error(
        `Unclosed '{{' in template text: "${text}"`,
      );
    }

    const path = text.slice(open + 2, close).trim();

    if (path.length === 0) {
      throw new Error(
        `Empty binding '{{}}' in template text: "${text}" — provide a dot-path like '{{product.name}}'`,
      );
    }

    if (!isValidPath(path)) {
      throw new Error(
        `Invalid binding path "${path}" in template text: "${text}" — expected dot-separated identifier like "product.name"`,
      );
    }

    tokens.push({ type: 'binding', path });
    pos = close + 2;
  }

  return tokens;
}
