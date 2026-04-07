// batch.ts — Concurrent batch compilation for @paragraf/compile.
//
// Runs compile() across multiple records with a concurrency semaphore.
// Uses collect-errors mode: all records are attempted; errors are captured
// per-record rather than aborting the entire batch.

import { compile } from './compile.js';
import type {
  CompileOptions,
  CompileBatchOptions,
  CompileBatchResult,
} from './types.js';

/** Default maximum concurrent compile() calls in-process. */
const DEFAULT_CONCURRENCY = 4;

/**
 * Compile a batch of records, collecting results and errors.
 *
 * All records are processed — errors on individual records do not abort
 * the batch. Each result has either `result` (success) or `error` (failure).
 *
 * @returns Array of CompileBatchResult in the same order as `options.records`.
 */
export async function compileBatch<T = unknown>(
  options: CompileBatchOptions<T>,
): Promise<CompileBatchResult<T>[]> {
  const {
    records,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    ...sharedOptions
  } = options;

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
      await acquire();
      try {
        const singleOptions: CompileOptions<T> = {
          ...sharedOptions,
          data: record,
        };
        const result = await compile(singleOptions);
        results[index] = { record, index, result };
      } catch (err) {
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
