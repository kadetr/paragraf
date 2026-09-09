// compile.worker.ts — worker_threads compile worker.
//
// Receives CompileWorkerInput messages, runs createCompilerSession + compile(),
// and posts a CompileWorkerResult back to the parent.
//
// Session is reused as long as fontsKey (serialised template.fonts) is unchanged.
// When fontsKey changes, the session is rebuilt.
//
// The message handler function `handleMessage` is exported for direct testing
// with vitest without spawning an actual thread. Dependencies are injectable.

import { parentPort } from 'worker_threads';

import {
  compile as _compile,
  createCompilerSession as _createCompilerSession,
} from '@paragraf/compile';
import type { CompilerSession } from '@paragraf/compile';
import type {
  CompileWorkerInput,
  CompileWorkerResult,
} from '../src/ipc-types.js';

// ─── Dependency types ─────────────────────────────────────────────────────────

type CompileFn = typeof _compile;
type CreateSessionFn = typeof _createCompilerSession;

/** Injectable dependencies — use defaults in production, inject mocks in tests. */
export interface WorkerDeps {
  compile: CompileFn;
  createCompilerSession: CreateSessionFn;
}

const defaultDeps: WorkerDeps = {
  compile: _compile,
  createCompilerSession: _createCompilerSession,
};

// ─── Session cache ────────────────────────────────────────────────────────────

/** The current cached session. Null until the first message arrives. */
let cachedSession: CompilerSession | null = null;
/** The fontsKey that produced cachedSession. */
let cachedFontsKey: string | null = null;

// ─── Core handler (exported for testing) ─────────────────────────────────────

/**
 * Process a CompileWorkerInput and return a CompileWorkerResult.
 *
 * Designed to be called directly in tests without spawning a worker_threads Worker.
 * Inject `sessionCache` and `deps` for test isolation.
 */
export async function handleMessage(
  input: CompileWorkerInput,
  sessionCache: { session: CompilerSession | null; fontsKey: string | null } = {
    session: cachedSession,
    fontsKey: cachedFontsKey,
  },
  deps: WorkerDeps = defaultDeps,
): Promise<CompileWorkerResult> {
  const { template, options, projectPath, fontsKey, validationErrors } = input;

  // ── Early-exit for pre-computed validation errors ───────────────────────

  if (validationErrors && validationErrors.length > 0) {
    return { type: 'error', errors: validationErrors };
  }

  // ── Session management ──────────────────────────────────────────────────

  if (sessionCache.session === null || sessionCache.fontsKey !== fontsKey) {
    sessionCache.session = await deps.createCompilerSession(template, {
      basePath: projectPath,
    });
    sessionCache.fontsKey = fontsKey;
    // Sync module-level cache so the live worker thread benefits too
    cachedSession = sessionCache.session;
    cachedFontsKey = fontsKey;
  }

  // ── Compile ─────────────────────────────────────────────────────────────

  const output = options.output ?? 'svg';

  try {
    const result = await deps.compile({
      ...options,
      template,
      session: sessionCache.session,
      output,
    });

    if (output === 'pdf') {
      return { type: 'pdf', buffer: result.data as Buffer };
    }

    // 'svg' returns a string (single SVG for the whole doc) or an array.
    // compile() with output='svg' returns data as a string when single page
    // and as string[] when multi-page. Normalise to string[].
    const raw = result.data as string | string[];
    const svgPages = Array.isArray(raw) ? raw : [raw];
    return { type: 'svg', svgPages, frameGeometry: input.frameGeometry };
  } catch (err) {
    return {
      type: 'compile-error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Worker thread entry point ────────────────────────────────────────────────

// Only wire up the parentPort listener when running as an actual worker thread.
if (parentPort !== null) {
  parentPort.on('message', async (input: CompileWorkerInput) => {
    const result = await handleMessage(input);
    parentPort!.postMessage(result);
  });
}
