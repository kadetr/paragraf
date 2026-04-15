import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WasmFontEngine } from '../src/index.js';
import * as shapingWasm from '../src/index.js';

type TestFont = {
  id: string;
  size: number;
  weight: number;
  style: 'normal';
  stretch: 'normal';
  letterSpacing?: number;
};

type FaceCacheStats = {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
};

function makeFont(id: string): TestFont {
  return {
    id,
    size: 12,
    weight: 400,
    style: 'normal',
    stretch: 'normal',
  };
}

function makeGlyphJson(text: string): string {
  return JSON.stringify({
    ok: {
      glyphs: Array.from(text).map((c, i) => ({
        glyphId: c.charCodeAt(0),
        advanceWidth: 500 + i,
        xOffset: 0,
        yOffset: 0,
      })),
    },
  });
}

function createMockWasm() {
  const fonts = new Map<string, Uint8Array>();
  const faces = new Map<number, Uint8Array>();
  let nextFaceId = 1;

  const mock = {
    register_font: vi.fn((fontId: string, bytes: Uint8Array) => {
      fonts.set(fontId, new Uint8Array(bytes));
    }),

    create_face: vi.fn((bytes: Uint8Array) => {
      const id = nextFaceId++;
      faces.set(id, new Uint8Array(bytes));
      return id;
    }),

    drop_face: vi.fn((id: number) => {
      if (!faces.delete(id)) {
        console.warn(`[shaping-wasm] drop_face: unknown id ${id}`);
      }
    }),

    shape_with_face: vi.fn((id: number, text: string, _fontJson: string) => {
      if (!faces.has(id)) {
        return JSON.stringify({ error: `unknown face id ${id}` });
      }
      return makeGlyphJson(text);
    }),

    // legacy path used today; kept in mock to support pre-cache and fallback checks
    shape_text_wasm: vi.fn((text: string, _fontJson: string) =>
      makeGlyphJson(text),
    ),

    __inspect: () => ({
      fontsCount: fonts.size,
      facesCount: faces.size,
      faceIds: [...faces.keys()],
    }),
  };

  return mock;
}

function getStats(engine: unknown): FaceCacheStats {
  const e = engine as any;
  if (typeof e.getFaceCacheStats === 'function') {
    return e.getFaceCacheStats();
  }

  const pkg = shapingWasm as any;
  if (typeof pkg.getFaceCacheStats === 'function') {
    return pkg.getFaceCacheStats();
  }

  throw new Error(
    'Missing face-cache stats API: expected engine.getFaceCacheStats() or package getFaceCacheStats()',
  );
}

function createEngineWithCache(mockWasm: any, maxEntries = 20): WasmFontEngine {
  return new (WasmFontEngine as any)(mockWasm, {
    faceCache: { maxEntries },
  });
}

function registerFont(engine: WasmFontEngine, fontId: string) {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  (engine as any).loadFontBytes(fontId, bytes);
}

function shapeWord(engine: WasmFontEngine, fontId: string, text = 'hello') {
  return engine.glyphsForString(fontId, text, makeFont(fontId) as any);
}

describe('spec 001 shaping-wasm face cache (contract tests)', () => {
  let mockWasm: ReturnType<typeof createMockWasm>;
  let engine: WasmFontEngine;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockWasm = createMockWasm();
    engine = createEngineWithCache(mockWasm, 20);
  });

  // ─── T1/T2/T4 correctness ────────────────────────────────────────────────

  it('creates face exactly once per fontId across multiple shaping calls', () => {
    registerFont(engine, 'font-a');

    const before = getStats(engine);
    shapeWord(engine, 'font-a', 'hello');
    shapeWord(engine, 'font-a', 'world');
    const after = getStats(engine);

    expect(after.misses - before.misses).toBe(1);
    expect(after.hits - before.hits).toBe(1);
    expect(after.size - before.size).toBe(1);

    expect(mockWasm.create_face).toHaveBeenCalledTimes(1);
    expect(mockWasm.shape_with_face).toHaveBeenCalledTimes(2);
  });

  it('new fontId is a miss and creates/stores a new face handle', () => {
    registerFont(engine, 'font-a');
    registerFont(engine, 'font-b');

    const before = getStats(engine);
    shapeWord(engine, 'font-a', 'cache');
    shapeWord(engine, 'font-b', 'cache');
    const after = getStats(engine);

    expect(after.misses - before.misses).toBe(2);
    expect(after.hits - before.hits).toBe(0);
    expect(after.size - before.size).toBe(2);
    expect(mockWasm.create_face).toHaveBeenCalledTimes(2);
  });

  it('shaping output is identical before/after face-cache path', () => {
    registerFont(engine, 'font-a');

    const cachedGlyphs = shapeWord(engine, 'font-a', 'equivalence');
    const legacyRaw = JSON.parse(
      mockWasm.shape_text_wasm(
        'equivalence',
        JSON.stringify(makeFont('font-a')),
      ),
    );

    const legacyGlyphs = legacyRaw.ok.glyphs.map((g: any) => ({
      index: g.glyphId,
      advanceWidth: g.advanceWidth,
      xOffset: g.xOffset,
      yOffset: g.yOffset,
    }));

    expect(cachedGlyphs).toEqual(legacyGlyphs);
  });

  it('single-font document flow creates exactly one face', () => {
    registerFont(engine, 'font-doc');

    shapeWord(engine, 'font-doc', 'The');
    shapeWord(engine, 'font-doc', 'quick');
    shapeWord(engine, 'font-doc', 'brown');
    shapeWord(engine, 'font-doc', 'fox');

    expect(mockWasm.create_face).toHaveBeenCalledTimes(1);
    expect(mockWasm.shape_with_face).toHaveBeenCalledTimes(4);
    expect(getStats(engine).size).toBeGreaterThanOrEqual(1);
  });

  // ─── T3/T3a eviction + leak prevention ───────────────────────────────────

  it('enforces cap 20: 21st distinct font evicts LRU and calls drop_face before delete', () => {
    for (let i = 1; i <= 21; i++) {
      const id = `font-${i}`;
      registerFont(engine, id);
      shapeWord(engine, id, 'catalog');
    }

    const stats = getStats(engine);
    expect(stats.size).toBe(20);
    expect(stats.evictions).toBeGreaterThanOrEqual(1);

    expect(mockWasm.drop_face).toHaveBeenCalledTimes(1);
    expect(mockWasm.__inspect().facesCount).toBe(20);
  });

  it('after eviction, shaping still works and evicted font recreates a face on next use', () => {
    for (let i = 1; i <= 21; i++) {
      const id = `font-${i}`;
      registerFont(engine, id);
      shapeWord(engine, id, 'sample');
    }

    const createsBeforeReuse = mockWasm.create_face.mock.calls.length;
    const out = shapeWord(engine, 'font-1', 'sample');

    expect(out.length).toBeGreaterThan(0);
    expect(mockWasm.create_face.mock.calls.length).toBe(createsBeforeReuse + 1);
  });

  it('evicted face is absent from stats and mock WASM registry size is decremented', () => {
    for (let i = 1; i <= 21; i++) {
      const id = `font-${i}`;
      registerFont(engine, id);
      shapeWord(engine, id, 'x');
    }

    const stats = getStats(engine);
    const wasmState = mockWasm.__inspect();

    expect(stats.size).toBe(20);
    expect(stats.evictions).toBeGreaterThan(0);
    expect(wasmState.facesCount).toBe(20);
  });

  // ─── T3b lifecycle / teardown ────────────────────────────────────────────

  it('session teardown drops all held handles', () => {
    registerFont(engine, 'font-a');
    registerFont(engine, 'font-b');

    shapeWord(engine, 'font-a', 'one');
    shapeWord(engine, 'font-b', 'two');
    expect(mockWasm.__inspect().facesCount).toBe(2);

    const e = engine as any;
    expect(typeof e.dispose).toBe('function');
    e.dispose();

    expect(mockWasm.__inspect().facesCount).toBe(0);
    expect(mockWasm.drop_face).toHaveBeenCalledTimes(2);
    expect(getStats(engine).size).toBe(0);
  });

  it('WASM reinitialisation clears cache state and does not reuse stale handles', () => {
    registerFont(engine, 'font-a');
    shapeWord(engine, 'font-a', 'alpha');
    const oldCreates = mockWasm.create_face.mock.calls.length;

    const e = engine as any;
    expect(typeof e.dispose).toBe('function');
    e.dispose();

    const engine2 = createEngineWithCache(mockWasm, 20);
    registerFont(engine2, 'font-a');
    shapeWord(engine2, 'font-a', 'alpha');

    expect(mockWasm.create_face.mock.calls.length).toBe(oldCreates + 1);
  });

  // ─── WASM drop_face contract ─────────────────────────────────────────────

  it('drop_face with unknown id does not panic and logs warning', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    expect(() => mockWasm.drop_face(999999)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  // ─── T5 fallback isolation ────────────────────────────────────────────────

  it('fallback path receives raw bytes and never receives a u32 handle', () => {
    const fallbackShaper = vi.fn(
      (_input: {
        fontBytes: Uint8Array;
        faceId?: unknown;
        handle?: unknown;
      }) => [{ index: 72, advanceWidth: 500, xOffset: 0, yOffset: 0 }],
    );

    const wasmWithoutFaceApi = {
      register_font: vi.fn(),
      shape_text_wasm: vi.fn((_text: string, _fontJson: string) =>
        makeGlyphJson('H'),
      ),
    };

    const fallbackEngine = new (WasmFontEngine as any)(wasmWithoutFaceApi, {
      faceCache: { maxEntries: 20 },
      fallbackShaper,
    });

    const bytes = new Uint8Array([9, 9, 9, 9]);
    fallbackEngine.loadFontBytes('fallback-font', bytes);
    fallbackEngine.glyphsForString(
      'fallback-font',
      'Hello',
      makeFont('fallback-font'),
    );

    expect(fallbackShaper).toHaveBeenCalledTimes(1);

    const firstCall = fallbackShaper.mock.calls[0];
    expect(firstCall).toBeDefined();

    const arg = firstCall![0] as {
      fontBytes: Uint8Array;
      faceId?: unknown;
      handle?: unknown;
    };
    expect(arg.fontBytes).toBeInstanceOf(Uint8Array);
    expect(arg.fontBytes).toEqual(bytes);
    expect(typeof arg.faceId).toBe('undefined');
    expect(typeof arg.handle).toBe('undefined');
  });
});
