import type { FontSpec } from '@paragraf/types';
import type { ParagraphStyleDef, ResolvedParagraphStyle } from './types.js';

// ─── Built-in defaults ────────────────────────────────────────────────────────

const DEFAULTS: ResolvedParagraphStyle = {
  font: {
    family: '',
    size: 10,
    weight: 400,
    style: 'normal',
    stretch: 'normal',
    letterSpacing: 0,
    variant: 'normal',
  },
  language: 'en-us',
  alignment: 'justified',
  lineHeight: 14,
  hyphenation: true,
  spaceBefore: 0,
  spaceAfter: 0,
  firstLineIndent: 0,
  tolerance: 2,
  looseness: 0,
  next: undefined,
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInheritance(defs: Record<string, ParagraphStyleDef>): void {
  // Pass 1: all extends refs must point to defined names
  for (const name of Object.keys(defs)) {
    const parent = defs[name].extends;
    if (parent !== undefined && !(parent in defs)) {
      throw new Error(
        `Style "${name}": extends "${parent}" which is not defined in the registry`,
      );
    }
  }

  // Pass 2: all next refs must point to defined names
  for (const name of Object.keys(defs)) {
    const next = defs[name].next;
    if (next !== undefined && !(next in defs)) {
      throw new Error(
        `Style "${name}": next "${next}" which is not defined in the registry`,
      );
    }
  }

  // Pass 3: cycle detection — walk each chain linearly
  for (const startName of Object.keys(defs)) {
    const seen = new Set<string>();
    let current: string | undefined = startName;
    while (current !== undefined) {
      if (seen.has(current)) {
        throw new Error(
          `Circular style inheritance detected involving "${current}"`,
        );
      }
      seen.add(current);
      current = defs[current]?.extends;
    }
  }
}

// ─── Resolution ───────────────────────────────────────────────────────────────

function mergeFont(
  base: Required<FontSpec>,
  override: FontSpec | undefined,
): Required<FontSpec> {
  if (override === undefined) return base;
  return {
    family: override.family !== undefined ? override.family : base.family,
    size: override.size !== undefined ? override.size : base.size,
    weight: override.weight !== undefined ? override.weight : base.weight,
    style: override.style !== undefined ? override.style : base.style,
    stretch: override.stretch !== undefined ? override.stretch : base.stretch,
    letterSpacing:
      override.letterSpacing !== undefined
        ? override.letterSpacing
        : base.letterSpacing,
    variant: override.variant !== undefined ? override.variant : base.variant,
  };
}

function buildChain(
  defs: Record<string, ParagraphStyleDef>,
  name: string,
): string[] {
  const chain: string[] = [];
  let current: string | undefined = name;
  while (current !== undefined) {
    chain.unshift(current); // prepend so root is first
    current = defs[current]?.extends;
  }
  return chain;
}

function resolveStyle(
  defs: Record<string, ParagraphStyleDef>,
  name: string,
): ResolvedParagraphStyle {
  const chain = buildChain(defs, name);

  let result: ResolvedParagraphStyle = {
    ...DEFAULTS,
    font: { ...DEFAULTS.font },
  };

  for (const step of chain) {
    const def = defs[step];
    if (!def) continue;

    result = {
      font: mergeFont(result.font, def.font),
      language: def.language ?? result.language,
      alignment: def.alignment ?? result.alignment,
      lineHeight: def.lineHeight ?? result.lineHeight,
      hyphenation: def.hyphenation ?? result.hyphenation,
      spaceBefore: def.spaceBefore ?? result.spaceBefore,
      spaceAfter: def.spaceAfter ?? result.spaceAfter,
      firstLineIndent: def.firstLineIndent ?? result.firstLineIndent,
      tolerance: def.tolerance ?? result.tolerance,
      looseness: def.looseness ?? result.looseness,
      next: def.next ?? result.next,
    };
  }

  return result;
}

// ─── StyleRegistry ────────────────────────────────────────────────────────────

export class StyleRegistry {
  readonly #defs: Record<string, ParagraphStyleDef>;
  readonly #cache = new Map<string, ResolvedParagraphStyle>();

  constructor(defs: Record<string, ParagraphStyleDef>) {
    this.#defs = defs;
  }

  has(name: string): boolean {
    return name in this.#defs;
  }

  resolve(name: string): ResolvedParagraphStyle {
    if (!this.has(name)) {
      throw new Error(`Style "${name}" is not defined in the registry`);
    }
    const cached = this.#cache.get(name);
    if (cached !== undefined) return cached;
    const result = resolveStyle(this.#defs, name);
    this.#cache.set(name, result);
    return result;
  }

  get(name: string): ParagraphStyleDef | undefined {
    return this.#defs[name];
  }

  names(): string[] {
    return Object.keys(this.#defs);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function defineStyles(
  defs: Record<string, ParagraphStyleDef>,
): StyleRegistry {
  validateInheritance(defs);
  return new StyleRegistry(defs);
}
