// shaping.ts — Shaping engine selection helpers.

import type { ComposerOptions } from '@paragraf/typography';
import { wasmStatus } from '@paragraf/typography';
import type { ShapingMode } from './types.js';

/**
 * Convert a ShapingMode option to ComposerOptions understood by
 * createParagraphComposer / createDefaultFontEngine.
 *
 * 'auto' maps to `undefined`, which triggers the default auto-detect behaviour
 * inside the typography package.
 */
export function resolveComposerOptions(
  shaping: ShapingMode,
): ComposerOptions | undefined {
  if (shaping === 'fontkit') return { useWasm: false };
  if (shaping === 'wasm') return { useWasm: true };
  return undefined; // auto
}

/**
 * Determine which shaping engine will actually be used given the resolved
 * ComposerOptions. Call this before createParagraphComposer to report the
 * correct value in CompileResult.metadata.shapingEngine.
 */
export function detectActualShaping(
  options: ComposerOptions | undefined,
): 'wasm' | 'fontkit' {
  if (options?.useWasm === false) return 'fontkit';
  const status = wasmStatus();
  return status.status === 'loaded' ? 'wasm' : 'fontkit';
}
