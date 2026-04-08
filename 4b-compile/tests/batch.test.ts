// batch.test.ts — Unit tests for compileBatch() and its concurrency semaphore.
//
// Uses real Liberation Serif fonts from the monorepo's /fonts/ directory.
// Tests the acquire/release/queue logic by instrumenting the compile calls
// to track in-flight concurrency, independent of font loading time.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compileBatch } from '../src/batch.js';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

function makeTemplate() {
  return defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
        bold: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'left',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{body}}' }],
  });
}

// ─── Result ordering ──────────────────────────────────────────────────────────

describe('compileBatch — result ordering', () => {
  const records = [
    { body: 'Record 0.' },
    { body: 'Record 1.' },
    { body: 'Record 2.' },
    { body: 'Record 3.' },
  ];

  it('returns results in original record order regardless of completion order', async () => {
    const results = await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      records,
    });
    expect(results).toHaveLength(4);
    for (let i = 0; i < records.length; i++) {
      expect(results[i]!.index).toBe(i);
      expect(results[i]!.record).toBe(records[i]);
    }
  });
});

// ─── onProgress ───────────────────────────────────────────────────────────────

describe('compileBatch — onProgress', () => {
  it('calls onProgress after every record with monotonically increasing count', async () => {
    const records = [{ body: 'A.' }, { body: 'B.' }, { body: 'C.' }];
    const calls: [number, number][] = [];

    await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      records,
      onProgress: (completed, total) => calls.push([completed, total]),
    });

    expect(calls).toHaveLength(3);
    // total is always 3
    expect(calls.every(([, t]) => t === 3)).toBe(true);
    // completed increases strictly
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]![0]).toBeGreaterThan(calls[i - 1]![0]);
    }
    // last call reports all done
    expect(calls[calls.length - 1]).toEqual([3, 3]);
  });
});

// ─── Error collection ─────────────────────────────────────────────────────────

describe('compileBatch — error collection', () => {
  it('captures per-record errors without aborting remaining records', async () => {
    const records = [
      { body: 'Short record A.' },
      { body: 'word '.repeat(5000) }, // overflows maxPages: 1 → throws
      { body: 'Short record C.' },
    ];

    const results = await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      maxPages: 1,
      onOverflow: 'throw',
      records,
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.error).toBeUndefined();
    expect(results[0]!.result).toBeDefined();
    expect(results[1]!.error).toBeDefined();
    expect(results[1]!.error!.message).toMatch(/overflow/i);
    expect(results[2]!.error).toBeUndefined();
    expect(results[2]!.result).toBeDefined();
  });
});

// ─── Concurrency semaphore ────────────────────────────────────────────────────

describe('compileBatch — concurrency semaphore', () => {
  it('never exceeds the concurrency limit during execution', async () => {
    // Instrument compile() to track the number of calls in-flight at any moment.
    // We replace compile with a stub that resolves after a short delay, giving
    // enough time for multiple tasks to be queued so the semaphore is exercised.
    const compileModule = await import('../src/compile.js');
    const stub = vi
      .spyOn(compileModule, 'compile')
      .mockImplementation(async (opts) => {
        inFlight++;
        if (inFlight > peakInFlight) peakInFlight = inFlight;
        // Small delay so concurrent tasks can accumulate
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        inFlight--;
        // Return a minimal valid result
        return {
          data: { pages: [] } as any,
          metadata: {
            pageCount: 0,
            overflowLines: 0,
            shapingEngine: 'fontkit' as const,
          },
        };
      });

    let inFlight = 0;
    let peakInFlight = 0;

    const records = Array.from({ length: 8 }, (_, i) => ({
      body: `Record ${i}`,
    }));

    await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      concurrency: 2,
      records,
    });

    stub.mockRestore();

    // The semaphore must have kept peak concurrency at or below the limit
    expect(peakInFlight).toBeGreaterThan(0);
    expect(peakInFlight).toBeLessThanOrEqual(2);
  });

  it('processes all records when concurrency is 1 (serial mode)', async () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      body: `Serial record ${i}.`,
    }));

    const results = await compileBatch({
      template: makeTemplate(),
      output: 'rendered',
      shaping: 'fontkit',
      concurrency: 1,
      records,
    });

    expect(results).toHaveLength(5);
    expect(results.every((r) => r.error === undefined)).toBe(true);
  });
});
