// shaping.ts — Shaping engine selection helpers.

import type { ComposerOptions } from '@paragraf/typography';
import { wasmStatus } from '@paragraf/typography';
import type { ShapingMode } from './types.js';

/**
 * Convert a ShapingMode option to ComposerOptions understood by
 * createParagraphComposer / createDefaultFontEngine.
 *
 * `'wasm'` is strict: the typography package throws when the binary is not
 * usable. `'auto'` falls back to fontkit with one warning per process; when
 * `verbose` is false the fallback is chosen here instead, so nothing is
 * printed.
 */
export function resolveComposerOptions(
  shaping: ShapingMode,
  verbose = true,
): ComposerOptions {
  if (shaping === 'auto' && !verbose && wasmStatus().status !== 'loaded') {
    return { shaping: 'fontkit' };
  }
  return { shaping };
}

/**
 * Determine which shaping engine will actually be used given the resolved
 * ComposerOptions. Call this before createParagraphComposer to report the
 * correct value in CompileResult.metadata.shapingEngine.
 */
export function detectActualShaping(
  options: ComposerOptions | undefined,
): 'wasm' | 'fontkit' {
  const mode =
    options?.shaping ?? (options?.useWasm === false ? 'fontkit' : 'auto');
  if (mode === 'fontkit') return 'fontkit';
  return wasmStatus().status === 'loaded' ? 'wasm' : 'fontkit';
}
