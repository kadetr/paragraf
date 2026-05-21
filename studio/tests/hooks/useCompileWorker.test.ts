// useCompileWorker.test.ts — RT13–RT15 for the useCompileWorker hook.
//
// Uses happy-dom environment (matched by tests/hooks/**).
// Stubs window.studio with vi.fn() callbacks to simulate IPC events.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompileWorker } from '../../src/hooks/useCompileWorker.js';
import type { CompileWorkerResult } from '../../src/ipc-types.js';

// Captured callbacks from window.studio stubs
let capturedOnCompileResult: ((result: CompileWorkerResult) => void) | null =
  null;
let capturedOnFileChanged: (() => void) | null = null;

function setupStudio(): void {
  capturedOnCompileResult = null;
  capturedOnFileChanged = null;

  Object.defineProperty(window, 'studio', {
    configurable: true,
    value: {
      onCompileResult: vi.fn((cb: (result: CompileWorkerResult) => void) => {
        capturedOnCompileResult = cb;
      }),
      onFileChanged: vi.fn((cb: () => void) => {
        capturedOnFileChanged = cb;
      }),
      openFolder: vi.fn(),
      getWorkspaceState: vi.fn(),
      setWorkspaceState: vi.fn(),
      triggerPdfCompile: vi.fn(),
      setCompileSetting: vi.fn(),
    },
  });
}

// ─── RT13 — initial state ────────────────────────────────────────────────────

describe('RT13 — hook returns isCompiling: false initially', () => {
  beforeEach(setupStudio);

  it('starts with isCompiling false, result null, lastError null', () => {
    const { result } = renderHook(() => useCompileWorker());
    expect(result.current.isCompiling).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.lastError).toBeNull();
  });
});

// ─── RT14 — svg result updates state ─────────────────────────────────────────

describe('RT14 — after onCompileResult fires with svg result → result updated, isCompiling false', () => {
  beforeEach(setupStudio);

  it('stores the svg result and clears isCompiling', async () => {
    const { result } = renderHook(() => useCompileWorker());

    // Simulate file changed → isCompiling should become true
    act(() => {
      capturedOnFileChanged?.();
    });
    expect(result.current.isCompiling).toBe(true);

    // Simulate compile result arriving
    const svgResult: CompileWorkerResult = {
      type: 'svg',
      svgPages: ['<svg/>'],
    };
    act(() => {
      capturedOnCompileResult?.(svgResult);
    });

    expect(result.current.isCompiling).toBe(false);
    expect(result.current.result).toEqual(svgResult);
    expect(result.current.lastError).toBeNull();
  });
});

// ─── RT15 — error result sets lastError ──────────────────────────────────────

describe('RT15 — after onCompileResult fires with error result → lastError is set, result unchanged', () => {
  beforeEach(setupStudio);

  it('sets lastError and does not update result', async () => {
    const { result } = renderHook(() => useCompileWorker());

    // Give it a prior svg result
    const svgResult: CompileWorkerResult = {
      type: 'svg',
      svgPages: ['<svg/>'],
    };
    act(() => {
      capturedOnCompileResult?.(svgResult);
    });
    expect(result.current.result).toEqual(svgResult);

    // Now fire a compile-error
    const errorResult: CompileWorkerResult = {
      type: 'compile-error',
      message: 'font missing',
    };
    act(() => {
      capturedOnCompileResult?.(errorResult);
    });

    expect(result.current.lastError).toBe('font missing');
    // result remains the last successful svg result
    expect(result.current.result).toEqual(svgResult);
  });

  it('sets lastError from validation errors', async () => {
    const { result } = renderHook(() => useCompileWorker());

    const errorResult: CompileWorkerResult = {
      type: 'error',
      errors: [{ field: 'layout', message: 'layout missing' }],
    };
    act(() => {
      capturedOnCompileResult?.(errorResult);
    });

    expect(result.current.lastError).toContain('layout missing');
    expect(result.current.result).toBeNull();
  });
});
