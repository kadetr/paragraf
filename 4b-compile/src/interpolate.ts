// interpolate.ts — Binding resolution for content slot text fields.
//
// Resolves `{{dot.path}}` tokens against a plain data record.
// Re-uses parseTokens from @paragraf/template.

import { parseTokens } from '@paragraf/template';

/**
 * Resolve an interpolated text string against a data record.
 *
 * Tokens are parsed from `text` by `parseTokens`. Literal tokens are kept
 * as-is; binding tokens are looked up via dot-path traversal in `data`.
 *
 * @returns The fully-resolved string, or `null` if **any** binding path
 *   resolves to `null` or `undefined`. The resolution is all-or-nothing:
 *   if a slot such as `'{{a}} {{b}}'` has `b` missing, the entire result
 *   is `null` even though `a` resolved successfully.
 */
export function resolveText(
  text: string,
  data: Record<string, unknown>,
): string | null {
  const tokens = parseTokens(text);
  const parts: string[] = [];

  for (const tok of tokens) {
    if (tok.type === 'literal') {
      parts.push(tok.value);
    } else if (tok.type === 'conditional') {
      // Null-guard: missing binding resolves to '' rather than nulling the slot.
      const value = traversePath(tok.path, data);
      parts.push(value === null || value === undefined ? '' : String(value));
    } else {
      const value = traversePath(tok.path, data);
      if (value === null || value === undefined) return null;
      parts.push(String(value));
    }
  }

  return parts.join('');
}

/**
 * Traverse a dot-separated path in a plain object tree.
 * Returns `undefined` if any segment along the path is missing.
 */
function traversePath(dotPath: string, data: Record<string, unknown>): unknown {
  const segments = dotPath.split('.');
  let current: unknown = data;

  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }

  return current;
}
