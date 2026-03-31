import { loadBuiltinSrgb } from './srgb.js';
import { loadProfile as loadProfileFromDisk } from './profile.js';
import { createTransform } from './transform.js';
import type { ColorProfile } from './profile.js';
import type { ColorTransform } from './transform.js';
import type { RenderingIntent } from './spaces.js';

// ─── Public types ────────────────────────────────────────────────────────────

export interface OutputIntent {
  profile: ColorProfile;
  condition: string;
}

export interface ColorManager {
  /** Load and cache an ICC profile from disk. Idempotent for the same path. */
  loadProfile(path: string): Promise<ColorProfile>;
  /** Return (and cache) the built-in sRGB profile synthesized in memory. */
  loadBuiltinSrgb(): ColorProfile;
  /** Create a compiled color transform between two profiles. */
  createTransform(
    source: ColorProfile,
    dest: ColorProfile,
    intent?: RenderingIntent,
  ): ColorTransform;
  /** Return an OutputIntent descriptor for PDF/X embedding. */
  getOutputIntent(profile: ColorProfile, condition: string): OutputIntent;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Create a new `ColorManager` instance.
 * Profiles are cached by path (or by the special key 'builtin-srgb').
 */
export function createColorManager(): ColorManager {
  const cache = new Map<string, ColorProfile>();

  return {
    async loadProfile(path: string): Promise<ColorProfile> {
      if (cache.has(path)) return cache.get(path)!;
      const profile = await loadProfileFromDisk(path);
      cache.set(path, profile);
      return profile;
    },

    loadBuiltinSrgb(): ColorProfile {
      const key = 'builtin-srgb';
      if (cache.has(key)) return cache.get(key)!;
      const profile = loadBuiltinSrgb();
      cache.set(key, profile);
      return profile;
    },

    createTransform(source, dest, intent): ColorTransform {
      return createTransform(source, dest, intent);
    },

    getOutputIntent(profile, condition): OutputIntent {
      return { profile, condition };
    },
  };
}
