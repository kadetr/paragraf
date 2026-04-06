// validate.ts — internal template validation. Not part of the public API.

import { defineStyles } from '@paragraf/style';
import type { Template } from './types.js';
import { parseTokens } from './interpolate.js';

/**
 * Validate a Template object. Throws with a descriptive message on the first
 * violation found. Called by defineTemplate().
 *
 * Checks performed:
 * 1. Style inheritance is valid — no cycles, no missing extends/next refs.
 * 2. Every content slot's `style` field references a defined style.
 * 3. Every content slot with `onMissing: 'fallback'` has a non-empty `fallbackText`.
 * 4. Every content slot's `text` field has valid `{{...}}` interpolation syntax.
 */
export function validateTemplate(t: Template): void {
  // 1. Validate style inheritance — defineStyles throws on any violation.
  //    The returned registry is discarded; we only want the validation side-effect.
  defineStyles(t.styles);

  const styleNames = new Set(Object.keys(t.styles));

  for (let i = 0; i < t.content.length; i++) {
    const slot = t.content[i];

    // 2. Style reference must exist.
    if (!styleNames.has(slot.style)) {
      throw new Error(
        `content[${i}].style "${slot.style}" is not defined in this template's styles`,
      );
    }

    // 3. Fallback invariant.
    if (slot.onMissing === 'fallback' && !slot.fallbackText) {
      throw new Error(
        `content[${i}]: onMissing is 'fallback' but fallbackText is not set`,
      );
    }

    // 4. Interpolation syntax — throws with a descriptive message on error.
    parseTokens(slot.text);
  }
}
