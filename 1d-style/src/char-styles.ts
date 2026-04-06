import type { CharStyleDef, ResolvedCharStyle } from './types.js';

// ─── CharStyleRegistry ────────────────────────────────────────────────────────

export class CharStyleRegistry {
  readonly #defs: Record<string, CharStyleDef>;

  constructor(defs: Record<string, CharStyleDef>) {
    this.#defs = defs;
  }

  resolve(name: string): ResolvedCharStyle {
    if (!(name in this.#defs)) {
      throw new Error(
        `Character style "${name}" is not defined in the registry`,
      );
    }
    const def = this.#defs[name];
    return {
      font: def.font ?? {},
      color: def.color,
    };
  }

  has(name: string): boolean {
    return name in this.#defs;
  }

  names(): string[] {
    return Object.keys(this.#defs);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function defineCharStyles(
  defs: Record<string, CharStyleDef>,
): CharStyleRegistry {
  return new CharStyleRegistry(defs);
}
