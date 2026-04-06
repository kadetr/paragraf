// validate.ts — internal template validation. Not part of the public API.

import { parseDimension } from '@paragraf/layout';
import { defineStyles } from '@paragraf/style';
import type { Template } from './types.js';
import { parseTokens } from './interpolate.js';

/**
 * Validate a Template object. Throws with a descriptive message on the first
 * violation found. Called by defineTemplate().
 *
 * Checks performed:
 * 1. Layout Dimension strings are parseable (margins, gutter, bleed).
 * 2. Style inheritance is valid — no cycles, no missing extends/next refs.
 *    NOTE: error messages for checks 2a (circular) and 2b (missing ref) are
 *    thrown by @paragraf/style's defineStyles(). If that package changes its
 *    error message wording, tests that match against /Circular/ or /extends "…"/
 *    will break.
 * 3. Every content slot's `style` field references a defined style.
 * 4. Every content slot with `onMissing: 'fallback'` has a non-empty `fallbackText`.
 * 5. `fallbackText` is not set without `onMissing: 'fallback'` (would be silently ignored).
 * 6. Every content slot's `text` field is non-empty and has valid `{{...}}` syntax.
 */
export function validateTemplate(t: Template): void {
  // 1. Layout — validate all Dimension values are parseable.
  try {
    const { margins, gutter, bleed } = t.layout;
    if (typeof margins === 'object' && !Array.isArray(margins)) {
      for (const val of Object.values(margins)) parseDimension(val);
    } else {
      parseDimension(margins);
    }
    if (gutter !== undefined) parseDimension(gutter);
    if (bleed !== undefined) parseDimension(bleed);
  } catch (e) {
    throw new Error(`layout: ${(e as Error).message}`);
  }

  // 2. Validate style inheritance — defineStyles throws on any violation.
  //    The returned registry is discarded; we only want the validation side-effect.
  //    NOTE: error messages originate from @paragraf/style — see JSDoc above.
  defineStyles(t.styles);

  const styleNames = new Set(Object.keys(t.styles));

  for (let i = 0; i < t.content.length; i++) {
    const slot = t.content[i];

    // 3. Style reference must exist.
    if (!styleNames.has(slot.style)) {
      throw new Error(
        `content[${i}].style "${slot.style}" is not defined in this template's styles`,
      );
    }

    // 4. Fallback invariant: onMissing:'fallback' requires fallbackText.
    if (slot.onMissing === 'fallback' && !slot.fallbackText) {
      throw new Error(
        `content[${i}]: onMissing is 'fallback' but fallbackText is not set`,
      );
    }

    // 5. Inverse fallback invariant: fallbackText without onMissing:'fallback' would
    //    be silently discarded by the compile layer — catch this early.
    if (slot.fallbackText !== undefined && slot.onMissing !== 'fallback') {
      throw new Error(
        `content[${i}]: fallbackText is set but onMissing is not 'fallback' — it would be ignored`,
      );
    }

    // 6. text must be non-empty and have valid {{...}} interpolation syntax.
    if (slot.text === '') {
      throw new Error(
        `content[${i}].text is empty — provide literal text or a {{binding}}`,
      );
    }
    parseTokens(slot.text);
  }
}
