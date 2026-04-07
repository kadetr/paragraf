// fonts.ts — Font registry construction and variant selection for @paragraf/compile.
//
// Implements the 18-key variant convention table (thin → black, italic variants)
// and CSS-style nearest-weight selection for family + weight + style queries.

import * as pathModule from 'path';
import type {
  FontId,
  FontStyle,
  FontStretch,
  FontRegistry,
} from '@paragraf/types';
import type { TemplateFonts, FontVariantEntry } from '@paragraf/template';

// ─── 18-key variant convention table ─────────────────────────────────────────

interface VariantMeta {
  weight: number;
  style: FontStyle;
}

/** Convention table: maps well-known variant key names to weight and style metadata. */
export const VARIANT_CONVENTIONS: Record<string, VariantMeta> = {
  thin: { weight: 100, style: 'normal' },
  extraLight: { weight: 200, style: 'normal' },
  light: { weight: 300, style: 'normal' },
  regular: { weight: 400, style: 'normal' },
  medium: { weight: 500, style: 'normal' },
  semiBold: { weight: 600, style: 'normal' },
  bold: { weight: 700, style: 'normal' },
  extraBold: { weight: 800, style: 'normal' },
  black: { weight: 900, style: 'normal' },
  thinItalic: { weight: 100, style: 'italic' },
  extraLightItalic: { weight: 200, style: 'italic' },
  lightItalic: { weight: 300, style: 'italic' },
  italic: { weight: 400, style: 'italic' },
  mediumItalic: { weight: 500, style: 'italic' },
  semiBoldItalic: { weight: 600, style: 'italic' },
  boldItalic: { weight: 700, style: 'italic' },
  extraBoldItalic: { weight: 800, style: 'italic' },
  blackItalic: { weight: 900, style: 'italic' },
};

// ─── Resolve a single variant entry ──────────────────────────────────────────

interface ResolvedVariant {
  filePath: string;
  weight: number;
  style: FontStyle;
  stretch: FontStretch;
}

/**
 * Expand a FontVariantEntry to its full metadata.
 *
 * - Object form: explicit `path`, `weight`, `style`, `stretch` fields take precedence
 *   over the convention table. Unknown keys resolve to 400/normal with a warning.
 * - String shorthand: the key is looked up in the convention table.
 *   Unknown keys emit a console.warn and default to 400/normal.
 */
export function resolveVariantEntry(
  key: string,
  entry: FontVariantEntry,
  basePath: string,
): ResolvedVariant {
  const convention = VARIANT_CONVENTIONS[key];

  if (typeof entry === 'string') {
    if (!convention) {
      console.warn(
        `[paragraf/compile] Unknown variant key "${key}": no weight/style convention found. ` +
          `Using weight 400 / style 'normal'. Use the object form { path, weight, style } to set metadata explicitly.`,
      );
    }
    return {
      filePath: absolutePath(entry, basePath),
      weight: convention?.weight ?? 400,
      style: convention?.style ?? 'normal',
      stretch: 'normal',
    };
  }

  // Object form — explicit fields override convention defaults
  return {
    filePath: absolutePath(entry.path, basePath),
    weight: entry.weight ?? convention?.weight ?? 400,
    style: entry.style ?? convention?.style ?? 'normal',
    stretch: entry.stretch ?? 'normal',
  };
}

function absolutePath(filePath: string, basePath: string): string {
  if (pathModule.isAbsolute(filePath)) return filePath;
  return pathModule.resolve(basePath, filePath);
}

// ─── Build FontRegistry ───────────────────────────────────────────────────────

/**
 * Build a `FontRegistry` (`Map<FontId, FontDescriptor>`) from the template font
 * declarations. Each variant gets a `FontId` of the form `"FamilyName/variantKey"`.
 *
 * File paths are resolved relative to `basePath`.
 */
export function buildFontRegistry(
  fonts: TemplateFonts,
  basePath: string,
): FontRegistry {
  const registry: FontRegistry = new Map();

  for (const [family, variants] of Object.entries(fonts)) {
    for (const [variantKey, entry] of Object.entries(variants)) {
      if (entry === undefined) continue;
      const resolved = resolveVariantEntry(variantKey, entry, basePath);
      const id: FontId = `${family}/${variantKey}`;
      registry.set(id, {
        id,
        family,
        filePath: resolved.filePath,
        weight: resolved.weight,
        style: resolved.style,
        stretch: resolved.stretch,
      });
    }
  }

  return registry;
}

// ─── selectVariant ────────────────────────────────────────────────────────────

/**
 * Return the `FontId` of the closest variant for a given family, weight, and
 * style using a simplified CSS font-weight matching algorithm.
 *
 * Matching order:
 * 1. Filter by family name.
 * 2. Prefer exact style match; fall back to 'normal', then ignore style.
 * 3. Among remaining candidates, find the nearest weight.
 *    Tie-breaking: target ≤ 500 prefers the lower weight; target > 500 prefers higher.
 *
 * Emits `console.warn` when no exact weight match exists.
 *
 * @throws when no variants at all are registered for the given family.
 */
export function selectVariant(
  family: string,
  weight: number,
  style: FontStyle,
  registry: FontRegistry,
): FontId {
  const all = [...registry.values()].filter((d) => d.family === family);
  if (all.length === 0) {
    throw new Error(
      `[paragraf/compile] No fonts registered for family "${family}". ` +
        `Check the template.fonts declaration.`,
    );
  }

  // Prefer exact style; fall back broadening the candidate set
  let pool = all.filter((d) => (d.style ?? 'normal') === style);
  if (pool.length === 0)
    pool = all.filter((d) => (d.style ?? 'normal') === 'normal');
  if (pool.length === 0) pool = all;

  const best = nearestWeight(pool, weight);

  if (best.weight !== weight) {
    console.warn(
      `[paragraf/compile] No exact weight ${weight} for family "${family}" (style: ${style}). ` +
        `Using weight ${best.weight} (id: ${best.id}).`,
    );
  }

  return best.id;
}

/** Nearest-weight selection with CSS-style tie-breaking. */
function nearestWeight(
  candidates: Array<{ id: FontId; weight?: number }>,
  target: number,
): { id: FontId; weight: number } {
  const pool = candidates.map((c) => ({ id: c.id, weight: c.weight ?? 400 }));

  pool.sort((a, b) => {
    const da = Math.abs(a.weight - target);
    const db = Math.abs(b.weight - target);
    if (da !== db) return da - db;
    // Tie-break: target <= 500 → prefer lower weight; target > 500 → prefer higher
    return target > 500 ? b.weight - a.weight : a.weight - b.weight;
  });

  return pool[0]!;
}
