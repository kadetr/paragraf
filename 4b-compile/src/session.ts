// session.ts — CompilerSession: reusable compilation context.
//
// A CompilerSession owns the font registry, paragraph composer, and font
// engine for a given template.  Build one session and pass it to many
// compile() calls to avoid re-loading fonts and re-initialising WASM on
// every call — critical for high-volume compileBatch workloads.
//
// Usage:
//   const session = await createCompilerSession(template, { basePath });
//   const results = await Promise.all(records.map(r => compile({ template, data: r, session })));

import type { FontRegistry } from '@paragraf/types';
import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import type { ParagraphComposer } from '@paragraf/typography';
import type { FontEngine } from '@paragraf/font-engine';
import type { Template } from '@paragraf/template';

import { buildFontRegistry } from './fonts.js';
import { resolveComposerOptions, detectActualShaping } from './shaping.js';
import type { ShapingMode } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Options passed to {@link createCompilerSession}. */
export interface SessionOptions {
  /**
   * Base path for resolving relative font file paths in the template.
   * @default process.cwd()
   */
  basePath?: string;
  /**
   * Font shaping engine.
   * @default 'auto'
   */
  shaping?: ShapingMode;
}

/**
 * A reusable compilation context.  Holds a font registry, paragraph composer,
 * and font engine that can be shared across many {@link compile} calls.
 *
 * Create via {@link createCompilerSession}; pass as `options.session` to
 * {@link compile} or {@link compileBatch}.
 */
export interface CompilerSession {
  /** Font descriptors keyed by FontId. */
  readonly registry: FontRegistry;
  /** Paragraph composer (Knuth-Plass, with shared measure cache). */
  readonly composer: ParagraphComposer;
  /** Font engine (fontkit or WASM). */
  readonly fontEngine: FontEngine;
  /** Resolved shaping engine identifier. */
  readonly shapingEngine: 'wasm' | 'fontkit';
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a {@link CompilerSession} for a given template.
 *
 * Resolves all font file paths and initialises the paragraph composer and
 * font engine once.  The session can then be passed to many compile() calls.
 *
 * @throws when any declared font file cannot be found on disk.
 */
export async function createCompilerSession(
  template: Template,
  options: SessionOptions = {},
): Promise<CompilerSession> {
  const { basePath = process.cwd(), shaping = 'auto' } = options;

  const registry = buildFontRegistry(template.fonts, basePath);
  const composerOpts = resolveComposerOptions(shaping);
  const shapingEngine = detectActualShaping(composerOpts);

  const [composer, fontEngine] = await Promise.all([
    createParagraphComposer(registry, composerOpts),
    createDefaultFontEngine(registry, composerOpts),
  ]);

  return { registry, composer, fontEngine, shapingEngine };
}
