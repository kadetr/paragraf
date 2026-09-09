// useCompileWorker.ts — bridges IPC compile events to React state.
//
// Subscribes to window.studio.onCompileResult (and optionally onFileChanged to
// track the in-flight compile) and returns a snapshot of the current compile state.

import { useState, useEffect } from 'react';
import type { CompileWorkerResult } from '../ipc-types.js';

export interface CompileWorkerState {
  result: CompileWorkerResult | null;
  isCompiling: boolean;
  lastError: string | null;
  /** Absolute path to the last successfully compiled PDF, or null. */
  pdfFilePath: string | null;
}

export function useCompileWorker(): CompileWorkerState {
  const [result, setResult] = useState<CompileWorkerResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pdfFilePath, setPdfFilePath] = useState<string | null>(null);

  useEffect(() => {
    const studio = (window as Window & { studio?: typeof window.studio })
      .studio;
    if (!studio) return;

    // Mark in-flight when a file changes
    studio.onFileChanged(() => {
      setIsCompiling(true);
    });

    // Receive compile result
    studio.onCompileResult((r: CompileWorkerResult) => {
      setIsCompiling(false);
      if (r.type === 'compile-error') {
        setLastError(r.message);
      } else if (r.type === 'error') {
        setLastError(r.errors.map((e) => e.message).join('; '));
      } else if (r.type === 'pdf') {
        setLastError(null);
        setPdfFilePath(r.filePath);
      } else {
        setLastError(null);
        setResult(r);
      }
    });
  }, []);

  return { result, isCompiling, lastError, pdfFilePath };
}
