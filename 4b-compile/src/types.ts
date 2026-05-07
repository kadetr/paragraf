// types.ts — Public option and result interfaces for @paragraf/compile.

import type { Template } from '@paragraf/template';
import type { RenderedDocument } from '@paragraf/typography';
import type { OutputIntent } from '@paragraf/render-pdf';
import type { CompilerSession } from './session.js';

export type { Template, OutputIntent, CompilerSession };

/** Output format produced by compile(). */
export type OutputFormat = 'pdf' | 'svg' | 'rendered';

/** Overflow handling strategy. */
export type OverflowBehavior = 'silent' | 'throw';

/** Font shaping engine selection. */
export type ShapingMode = 'auto' | 'wasm' | 'fontkit';

/**
 * Options for compiling a single document.
 */
export interface CompileOptions<T = unknown> {
  /** Validated template produced by defineTemplate(). */
  template: Template;
  /** Data record to interpolate into content slots. */
  data: T;
  /**
   * Optional normalizer applied to data before binding resolution.
   * Use to flatten or reshape raw data into the shape the template expects.
   */
  normalize?: (raw: T) => Record<string, unknown>;
  /**
   * Output format.
   * - 'pdf'      — Returns a Buffer containing a PDF file.
   * - 'svg'      — Returns a string containing one SVG element per page, joined by newlines.
   * - 'rendered' — Returns the RenderedDocument directly (for custom rendering).
   * @default 'pdf'
   */
  output?: OutputFormat;
  /**
   * Base path for resolving relative font file paths declared in the template.
   * @default process.cwd()
   */
  basePath?: string;
  /**
   * Behaviour when composed content overflows the maximum page count.
   * - 'throw'  — throw an Error describing the overflow (default).
   * - 'silent' — truncate silently; `metadata.overflowLines` reports the count.
   * @default 'throw'
   */
  onOverflow?: OverflowBehavior;
  /**
   * Font shaping engine.
   * - 'auto'    — use WASM when available, fall back to fontkit (recommended).
   * - 'wasm'    — force WASM (falls back silently to fontkit when not built).
   * - 'fontkit' — always use the TypeScript/fontkit path.
   * @default 'auto'
   */
  shaping?: ShapingMode;
  /** PDF document title stored in the Info dictionary. */
  title?: string;
  /** BCP 47 language tag stored in the Info dictionary. */
  lang?: string;
  /** Add an invisible searchable text layer to the PDF. Requires `output: 'pdf'`. */
  selectable?: boolean;
  /**
   * Embed an ICC OutputIntent in the PDF catalog for PDF/A or PDF/X compliance.
   * Has no effect when `output` is not `'pdf'`; emits a console.warn in that case.
   */
  outputIntent?: OutputIntent;
  /**
   * Opt in to PDF/X-3 conformance markers. When set, the generated PDF Info dict
   * will include `GTS_PDFXVersion` and `Trapped`, and the OutputIntent will use
   * `S: GTS_PDFX` unconditionally. Requires `outputIntent` to be set; emits a
   * console.warn and has no effect otherwise.
   * Has no effect when `output` is not `'pdf'`.
   */
  pdfxConformance?: 'PDF/X-3:2002' | 'PDF/X-3:2003';
  /**
   * Maximum number of pages to generate. Must be >= 1. Content that exceeds
   * this limit is silently truncated (or throws if `onOverflow: 'throw'`).
   * Throws a RangeError if set to 0 or a negative value.
   * @default 100
   */
  maxPages?: number;
  /**
   * Pre-built compilation session. When provided, `compile()` skips font
   * registry construction and composer/engine initialisation — useful for
   * batch compiles where the same template is compiled many times.
   * Create via {@link createCompilerSession}.
   */
  session?: CompilerSession;
  /**
   * When `false`, suppresses all non-critical `console.warn` output from
   * the compile pipeline (style compatibility warnings, non-exact weight
   * matches, etc.). Error-level conditions still throw.
   * @default true
   */
  verbose?: boolean;
}

/** Result returned by compile(). */
export interface CompileResult {
  /**
   * The rendered output:
   * - `Buffer`           when `output` is `'pdf'`
   * - `string`           when `output` is `'svg'`
   * - `RenderedDocument` when `output` is `'rendered'`
   */
  data: Buffer | string | RenderedDocument;
  metadata: {
    /** Number of pages in the output document. */
    pageCount: number;
    /**
     * Number of composed lines that did not fit within the page limit.
     * Zero when all content was placed.
     */
    overflowLines: number;
    /** Which font shaping engine was actually used for this compile. */
    shapingEngine: 'wasm' | 'fontkit';
  };
}

/** Options for compiling a batch of documents. */
export interface CompileBatchOptions<T> extends Omit<
  CompileOptions<T>,
  'data'
> {
  /** Records to compile; each record produces one CompileResult. */
  records: T[];
  /**
   * Maximum number of compile() calls running concurrently in-process.
   * Must be ≥ 1. Throws a RangeError if set to 0 or a negative value.
   * @default 4
   */
  concurrency?: number;
  /**
   * Called after each record finishes (successfully or with an error).
   * @param completed Number of records finished so far.
   * @param total     Total number of records.
   */
  onProgress?: (completed: number, total: number) => void;
  /**
   * Optional cancellation signal. When the signal is aborted, any records
   * that have not yet started are not started, and `compileBatch` rejects
   * with a `DOMException` (`name: 'AbortError'`). Records that are already
   * in-flight complete normally — abort is pending-only cancellation.
   */
  signal?: AbortSignal;
}

/** One entry in a compileBatch result array. Either `result` or `error` is set. */
export interface CompileBatchResult<T> {
  /** The record that was compiled. */
  record: T;
  /** 0-based index into the original `records` array. */
  index: number;
  /** Set when compilation succeeded. */
  result?: CompileResult;
  /** Set when compilation threw. */
  error?: Error;
}
