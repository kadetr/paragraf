// compile.worker.test.ts — RT1–RT7 for handleMessage() in compile.worker.ts.
//
// All tests import handleMessage() directly — no worker_threads are spawned.
// Integration tests (RT1, RT6) use real Liberation Serif fonts from /fonts/.
// Unit tests (RT2–RT5) pass mock functions via the `deps` parameter (DI).

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { handleMessage } from '../../workers/compile.worker.js';
import type { WorkerDeps } from '../../workers/compile.worker.js';
import type { CompileWorkerInput, CompileWorkerResult } from '../../src/ipc-types.js';

const FONTS_DIR = path.resolve(__dirname, '../../../fonts');

// ─── Shared fixture ───────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CompileWorkerInput> = {}): CompileWorkerInput {
  const template = defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
        bold: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
        italic: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
        boldItalic: path.join(FONTS_DIR, 'LiberationSerif-BoldItalic.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'justified',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{text}}' }],
  });

  return {
    template,
    options: { data: { text: 'Hello world.' }, output: 'svg' },
    projectPath: FONTS_DIR,
    fontsKey: '{"Liberation Serif":{}}',
    ...overrides,
  };
}

/** Returns a minimal mock WorkerDeps. Override individual fields per test. */
function makeMockDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    compile: vi.fn(),
    createCompilerSession: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ─── RT1 — integration: valid input → SVG result ──────────────────────────────

describe('RT1 — valid CompileWorkerInput → { type: svg, svgPages }', () => {
  it('returns svgPages with at least one page', async () => {
    const result = await handleMessage(makeInput());

    expect(result.type).toBe('svg');
    const r = result as Extract<CompileWorkerResult, { type: 'svg' }>;
    expect(Array.isArray(r.svgPages)).toBe(true);
    expect(r.svgPages.length).toBeGreaterThanOrEqual(1);
    expect(r.svgPages[0]).toContain('<svg');
  });
});

// ─── RT2 — validation errors early-exit ───────────────────────────────────────

describe('RT2 — CompileWorkerInput with validationErrors → { type: error } without calling compile()', () => {
  it('returns error result and skips compile()', async () => {
    const deps = makeMockDeps();
    const errors = [{ field: 'layout', message: 'layout is required' }];

    const result = await handleMessage(
      makeInput({ validationErrors: errors }),
      { session: null, fontsKey: null },
      deps,
    );

    expect(result.type).toBe('error');
    const r = result as Extract<CompileWorkerResult, { type: 'error' }>;
    expect(r.errors).toEqual(errors);
    expect(vi.mocked(deps.compile)).not.toHaveBeenCalled();
  });
});

// ─── RT3 — compile() throws → compile-error result ───────────────────────────

describe('RT3 — compile() throws → { type: compile-error, message }, no rethrow', () => {
  it('catches compile errors and returns compile-error result', async () => {
    const deps = makeMockDeps({
      compile: vi.fn().mockRejectedValue(new Error('font not found')),
    });

    const result = await handleMessage(
      makeInput(),
      { session: null, fontsKey: null },
      deps,
    );

    expect(result.type).toBe('compile-error');
    const r = result as Extract<CompileWorkerResult, { type: 'compile-error' }>;
    expect(r.message).toContain('font not found');
  });
});

// ─── RT4 — session reuse ──────────────────────────────────────────────────────

describe('RT4 — two calls with identical fontsKey → createCompilerSession called once', () => {
  it('reuses the session on the second call', async () => {
    const mockSvgResult = { data: '<svg></svg>', metadata: { pageCount: 1, overflowLines: 0, overfullLines: [], fallbackParagraphs: [], shapingEngine: 'fontkit' as const } };
    const deps = makeMockDeps({
      compile: vi.fn().mockResolvedValue(mockSvgResult),
    });

    const input = makeInput({ fontsKey: 'same-key' });
    const cache = { session: null, fontsKey: null };

    await handleMessage(input, cache, deps);
    await handleMessage(input, cache, deps);

    expect(vi.mocked(deps.createCompilerSession)).toHaveBeenCalledTimes(1);
  });
});

// ─── RT5 — session invalidation ───────────────────────────────────────────────

describe('RT5 — two calls where fontsKey changes → createCompilerSession called twice', () => {
  it('rebuilds the session when fontsKey changes', async () => {
    const mockSvgResult = { data: '<svg></svg>', metadata: { pageCount: 1, overflowLines: 0, overfullLines: [], fallbackParagraphs: [], shapingEngine: 'fontkit' as const } };
    const deps = makeMockDeps({
      compile: vi.fn().mockResolvedValue(mockSvgResult),
    });

    const cache = { session: null, fontsKey: null };

    await handleMessage(makeInput({ fontsKey: 'fonts-v1' }), cache, deps);
    await handleMessage(makeInput({ fontsKey: 'fonts-v2' }), cache, deps);

    expect(vi.mocked(deps.createCompilerSession)).toHaveBeenCalledTimes(2);
  });
});

// ─── RT6 — integration: output='pdf' → pdf result ────────────────────────────

describe('RT6 — output: pdf → { type: pdf, buffer: Buffer }', () => {
  it('returns a Buffer for pdf output', async () => {
    const result = await handleMessage(
      makeInput({ options: { data: { text: 'Hello.' }, output: 'pdf' } }),
    );

    expect(result.type).toBe('pdf');
    const r = result as Extract<CompileWorkerResult, { type: 'pdf' }>;
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(r.buffer.length).toBeGreaterThan(0);
  });
});

// ─── RT7 — TypeScript type check: CompileWorkerResult union completeness ───────

describe('RT7 — CompileWorkerResult union covers all branches', () => {
  it('is exhaustively typed (compile-time check)', () => {
    function assertExhaustive(result: CompileWorkerResult): string {
      switch (result.type) {
        case 'svg': return 'svg';
        case 'pdf': return 'pdf';
        case 'error': return 'error';
        case 'compile-error': return 'compile-error';
        default: {
          const _: never = result;
          return _;
        }
      }
    }

    expect(assertExhaustive({ type: 'svg', svgPages: ['<svg/>'] })).toBe('svg');
    expect(assertExhaustive({ type: 'pdf', buffer: Buffer.from('') })).toBe('pdf');
    expect(assertExhaustive({ type: 'error', errors: [] })).toBe('error');
    expect(assertExhaustive({ type: 'compile-error', message: 'oops' })).toBe('compile-error');
  });
});

// ─── RT8–RT12 — shaping mode reaches the session ─────────────────────────────

const mockSvg = {
  data: '<svg></svg>',
  metadata: {
    pageCount: 1,
    overflowLines: 0,
    overfullLines: [],
    fallbackParagraphs: [],
    shapingEngine: 'fontkit' as const,
  },
};

type Shaping = 'fontkit' | 'wasm' | 'auto';

function shapingInput(shaping?: Shaping, fontsKey = 'same-key'): CompileWorkerInput {
  return makeInput({
    fontsKey,
    options: { data: { text: 'Hello.' }, output: 'svg', verbose: false, shaping },
  });
}

/** The shaping modes createCompilerSession was called with, in call order. */
function sessionShapings(deps: WorkerDeps): unknown[] {
  return vi
    .mocked(deps.createCompilerSession)
    .mock.calls.map((call) => call[1]?.shaping);
}

describe('RT8 — no shaping in options → session is created on "auto"', () => {
  it('keeps the library default for templates that set no shaping mode', async () => {
    const deps = makeMockDeps({ compile: vi.fn().mockResolvedValue(mockSvg) });

    await handleMessage(makeInput(), { session: null, fontsKey: null }, deps);

    expect(sessionShapings(deps)).toEqual(['auto']);
  });
});

describe('RT9 — options.shaping is passed to createCompilerSession', () => {
  it.each(['fontkit', 'wasm', 'auto'] as const)(
    'creates the session with shaping: %s',
    async (shaping) => {
      const deps = makeMockDeps({ compile: vi.fn().mockResolvedValue(mockSvg) });

      await handleMessage(
        shapingInput(shaping),
        { session: null, fontsKey: null },
        deps,
      );

      expect(sessionShapings(deps)).toEqual([shaping]);
    },
  );
});

describe('RT10 — shaping change with identical fontsKey → session is rebuilt', () => {
  it('rebuilds on a mode change and reuses when the mode is unchanged', async () => {
    const deps = makeMockDeps({ compile: vi.fn().mockResolvedValue(mockSvg) });
    const cache = { session: null, fontsKey: null };

    await handleMessage(shapingInput(undefined), cache, deps);
    await handleMessage(shapingInput('fontkit'), cache, deps);
    await handleMessage(shapingInput('fontkit'), cache, deps);
    await handleMessage(shapingInput('wasm'), cache, deps);

    expect(sessionShapings(deps)).toEqual(['auto', 'fontkit', 'wasm']);
  });

  it('treats an unset mode and an explicit "auto" as the same session', async () => {
    const deps = makeMockDeps({ compile: vi.fn().mockResolvedValue(mockSvg) });
    const cache = { session: null, fontsKey: null };

    await handleMessage(shapingInput(undefined), cache, deps);
    await handleMessage(shapingInput('auto'), cache, deps);

    expect(vi.mocked(deps.createCompilerSession)).toHaveBeenCalledTimes(1);
  });
});

describe('RT11 — createCompilerSession throws → { type: compile-error }', () => {
  it('returns the error, skips compile() and retries the session next time', async () => {
    const deps = makeMockDeps({
      compile: vi.fn().mockResolvedValue(mockSvg),
      createCompilerSession: vi
        .fn()
        .mockRejectedValueOnce(new Error('WASM shaper is not built'))
        .mockResolvedValue({}),
    });
    const cache = { session: null, fontsKey: null };

    const first = await handleMessage(shapingInput('wasm'), cache, deps);

    expect(first).toEqual({
      type: 'compile-error',
      message: 'WASM shaper is not built',
    });
    expect(vi.mocked(deps.compile)).not.toHaveBeenCalled();
    expect(cache.session).toBeNull();

    const second = await handleMessage(shapingInput('wasm'), cache, deps);

    expect(second.type).toBe('svg');
    expect(vi.mocked(deps.createCompilerSession)).toHaveBeenCalledTimes(2);
  });
});

describe('RT12 — integration: the session engine follows the requested mode', () => {
  /** Runs the real library and reports the engine of the session it built. */
  async function run(shaping?: Shaping) {
    const real = await import('@paragraf/compile');
    const engines: string[] = [];
    const deps: WorkerDeps = {
      compile: real.compile,
      createCompilerSession: async (template, opts) => {
        const session = await real.createCompilerSession(template, opts);
        engines.push(session.shapingEngine);
        return session;
      },
    };
    const result = await handleMessage(
      shapingInput(shaping),
      { session: null, fontsKey: null },
      deps,
    );
    return { result, engine: engines[0] as string | undefined };
  }

  it('"fontkit" builds a fontkit session and compiles', async () => {
    const { result, engine } = await run('fontkit');

    expect(engine).toBe('fontkit');
    expect(result.type).toBe('svg');
  });

  it('"wasm" builds a WASM session, or reports the library error', async () => {
    const auto = await run(undefined);
    const { result, engine } = await run('wasm');

    if (auto.engine === 'wasm') {
      // The WASM binary is built in this checkout.
      expect(engine).toBe('wasm');
      expect(result.type).toBe('svg');
    } else {
      // No binary: no session is created and the preview gets the reason.
      expect(engine).toBeUndefined();
      expect(result.type).toBe('compile-error');
      const r = result as Extract<CompileWorkerResult, { type: 'compile-error' }>;
      expect(r.message).toMatch(/wasm/i);
    }
  });
});
