// batch.ts — Concurrent batch compilation for @paragraf/compile.
//
// Runs compile() across multiple records with a concurrency semaphore.
// Uses collect-errors mode: all records are attempted; errors are captured
// per-record rather than aborting the entire batch.
//
// One CompilerSession is created for the whole batch so fonts and WASM are
// loaded only once, regardless of the number of records.

import { compile } from './compile.js';
import { createCompilerSession } from './session.js';
import type {
  CompileOptions,
  CompileBatchOptions,
  CompileBatchResult,
} from './types.js';

/** Default maximum concurrent compile() calls in-process. */
const DEFAULT_CONCURRENCY = 4;

/**
 * Compile a batch of records concurrently, collecting results and errors.
 *
 * **Session sharing**: A single `CompilerSession` is created for the whole
 * batch, so font loading and WASM initialisation happen once regardless of
 * the number of records. Pass an existing `session` in `options` to reuse
 * one across multiple `compileBatch` calls.
 *
 * **Collect-errors model**: All records are attempted — an error on one
 * record does not abort the remaining records. Each entry in the returned
 * array has either `result` (success) or `error` (failure). The output
 * array is always in the same order as the input `records` array.
 *
 * **Concurrency**: At most `concurrency` compile calls run simultaneously
 * (default {@link DEFAULT_CONCURRENCY}). Raises `RangeError` if `concurrency`
 * is `< 1`.
 *
 * **Abort**: If `options.signal` is provided and the signal fires, any records
 * that have not yet started are not started, and `compileBatch` rejects with a
 * `DOMException` (`name: 'AbortError'`). Records already in-flight complete
 * normally (pending-only cancellation).
 *
 * @returns Array of {@link CompileBatchResult} in the same order as
 *   `options.records`.
 */
export async function compileBatch<T = unknown>(
  options: CompileBatchOptions<T>,
): Promise<CompileBatchResult<T>[]> {
  const {
    records,
    concurrency: rawConcurrency = DEFAULT_CONCURRENCY,
    onProgress,
    signal,
    ...sharedOptions
  } = options;

  if (rawConcurrency < 1) {
    throw new RangeError(
      `compileBatch: concurrency must be ≥ 1 (got ${rawConcurrency})`,
    );
  }
  const concurrency = rawConcurrency;

  // Early abort check: if the signal is already fired, bail before creating
  // the session (which does font loading + WASM init).
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Build one shared session so fonts + WASM initialise once for the whole batch.
  // If the caller already provided a session, reuse it as-is.
  const session =
    sharedOptions.session ??
    (await createCompilerSession(sharedOptions.template, {
      basePath: sharedOptions.basePath,
      shaping: sharedOptions.shaping,
    }));

  const total = records.length;
  const results: CompileBatchResult<T>[] = new Array(total);
  let completed = 0;

  // Simple in-process semaphore using a counter and a queue of waiters
  let running = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (running < concurrency) {
        running++;
        resolve();
      } else {
        queue.push(() => {
          running++;
          resolve();
        });
      }
    });
  }

  function release(): void {
    running--;
    const next = queue.shift();
    if (next) next();
  }

  const tasks = records.map((record, index) =>
    (async () => {
      // Abort check: if the signal already fired, skip this record immediately.
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      await acquire();
      // Second abort check after acquiring the slot: if the signal fired while
      // this record was waiting in the semaphore queue, cancel before starting.
      if (signal?.aborted) {
        release();
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const singleOptions: CompileOptions<T> = {
          ...sharedOptions,
          data: record,
          session,
        };
        const result = await compile(singleOptions);
        results[index] = { record, index, result };
      } catch (err) {
        // Re-throw AbortError so compileBatch rejects rather than resolving with
        // an error entry — matches documented "rejects with AbortError" behavior.
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          release();
          throw err;
        }
        results[index] = {
          record,
          index,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      } finally {
        release();
        completed++;
        onProgress?.(completed, total);
      }
    })(),
  );

  await Promise.all(tasks);
  return results;
}
