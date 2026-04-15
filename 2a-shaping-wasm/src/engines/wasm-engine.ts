// src/engines/wasm-engine.ts
// FontEngine implementation backed by the Rust/WASM core (rustybuzz).
// GSUB features (liga, sups/subs) and GPOS kern are applied at shape time,
// so applyLigatures / applySingleSubstitution / getKerning are no-ops.

import { readFileSync } from 'fs';
import {
  FontEngine,
  Glyph,
  GlyphPath,
  PathCommand,
} from '@paragraf/font-engine';
import { Font, FontMetrics } from '@paragraf/types';

export type FaceCacheStats = {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
};

export type FaceCacheOptions = {
  maxEntries?: number;
};

export type FallbackShapeInput = {
  fontId: string;
  text: string;
  font: Font;
  fontBytes: Uint8Array;
};

export type WasmFontEngineOptions = {
  faceCache?: FaceCacheOptions;
  fallbackShaper?: (input: FallbackShapeInput) => Glyph[];
};

const DEFAULT_FACE_CACHE_MAX_ENTRIES = 20;

let globalFaceCacheStats: FaceCacheStats = {
  size: 0,
  hits: 0,
  misses: 0,
  evictions: 0,
};

export function getFaceCacheStats(): FaceCacheStats {
  return { ...globalFaceCacheStats };
}

export class WasmFontEngine implements FontEngine {
  private readonly wasm: any;
  private readonly fallbackShaper?: (input: FallbackShapeInput) => Glyph[];
  private readonly maxFaceCacheEntries: number;

  // Font bytes remain JS-owned; face handles are a separate cache layer.
  private readonly fontBytesById = new Map<string, Uint8Array>();
  private readonly faceHandlesByFontId = new Map<string, number>();
  private stats: FaceCacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  private readonly hasFaceApi: boolean;

  constructor(wasm: any, options?: WasmFontEngineOptions) {
    this.wasm = wasm;
    this.fallbackShaper = options?.fallbackShaper;
    this.maxFaceCacheEntries =
      options?.faceCache?.maxEntries ?? DEFAULT_FACE_CACHE_MAX_ENTRIES;
    this.hasFaceApi =
      typeof wasm?.create_face === 'function' &&
      typeof wasm?.drop_face === 'function' &&
      typeof wasm?.shape_with_face === 'function';
    this.syncGlobalStats();
  }

  private syncGlobalStats(): void {
    globalFaceCacheStats = this.getFaceCacheStats();
  }

  getFaceCacheStats(): FaceCacheStats {
    return {
      ...this.stats,
      size: this.faceHandlesByFontId.size,
    };
  }

  async loadFont(id: string, path: string): Promise<void> {
    try {
      const data = new Uint8Array(readFileSync(path));
      this.loadFontBytes(id, data);
    } catch (err) {
      throw new Error(
        `WasmFontEngine: failed to load font "${id}" from "${path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Browser-compatible alternative to loadFont().
   * Registers raw font bytes (e.g. from fetch().arrayBuffer()) without fs access.
   */
  loadFontBytes(id: string, bytes: Uint8Array): void {
    const ownedCopy = new Uint8Array(bytes);
    this.fontBytesById.set(id, ownedCopy);
    this.wasm.register_font(id, ownedCopy);
  }

  private mapShapeResult(rawJson: string, source: string): Glyph[] {
    const raw = JSON.parse(rawJson);
    if ('error' in raw)
      throw new Error(`WasmFontEngine ${source}: ${raw.error}`);

    return (
      raw.ok.glyphs as Array<{
        glyphId: number;
        advanceWidth: number;
        xOffset: number;
        yOffset: number;
      }>
    ).map((g) => ({
      index: g.glyphId,
      advanceWidth: g.advanceWidth,
      xOffset: g.xOffset,
      yOffset: g.yOffset,
    }));
  }

  private touchFaceHandle(fontId: string, handle: number): void {
    // LRU ordering uses insertion order: move touched key to the end.
    this.faceHandlesByFontId.delete(fontId);
    this.faceHandlesByFontId.set(fontId, handle);
  }

  private evictIfNeeded(): void {
    if (this.maxFaceCacheEntries <= 0) return;
    if (this.faceHandlesByFontId.size < this.maxFaceCacheEntries) return;

    const oldest = this.faceHandlesByFontId.entries().next().value as
      | [string, number]
      | undefined;
    if (!oldest) return;

    const [oldestFontId, oldestHandle] = oldest;
    // Hard contract: drop WASM face before removing JS cache entry.
    this.wasm.drop_face(oldestHandle);
    this.faceHandlesByFontId.delete(oldestFontId);
    this.stats.evictions += 1;
  }

  private createFaceHandle(fontId: string): number {
    const bytes = this.fontBytesById.get(fontId);
    if (!bytes) {
      throw new Error(
        `WasmFontEngine: font bytes for '${fontId}' are not loaded`,
      );
    }
    const handle = this.wasm.create_face(bytes);
    if (typeof handle !== 'number') {
      throw new Error(
        'WasmFontEngine: create_face did not return a numeric handle',
      );
    }
    if (handle === 0) {
      throw new Error(
        `WasmFontEngine: create_face failed for font '${fontId}'`,
      );
    }
    return handle >>> 0;
  }

  private getOrCreateFaceHandle(fontId: string): number {
    const cached = this.faceHandlesByFontId.get(fontId);
    if (cached !== undefined) {
      this.stats.hits += 1;
      this.touchFaceHandle(fontId, cached);
      this.syncGlobalStats();
      return cached;
    }

    this.stats.misses += 1;
    this.evictIfNeeded();
    const created = this.createFaceHandle(fontId);
    if (this.maxFaceCacheEntries > 0) {
      this.faceHandlesByFontId.set(fontId, created);
    }
    this.syncGlobalStats();
    return created;
  }

  dispose(): void {
    for (const [, handle] of this.faceHandlesByFontId) {
      this.wasm.drop_face(handle);
    }
    this.faceHandlesByFontId.clear();
    this.syncGlobalStats();
  }

  /**
   * Shape `text` using rustybuzz, returning per-glyph info in font units.
   * `font` provides the font id, variant, and letter spacing.
   * When omitted, falls back to normal shaping (liga/rlig, no sups/subs).
   */
  glyphsForString(fontId: string, text: string, font?: Font): Glyph[] {
    const shapeFont: Font = font ?? {
      id: fontId,
      size: 12,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    };

    if (this.hasFaceApi) {
      if (this.maxFaceCacheEntries <= 0) {
        // Cache-disabled mode: create, shape, drop in one call path.
        const oneShot = this.createFaceHandle(fontId);
        try {
          return this.mapShapeResult(
            this.wasm.shape_with_face(oneShot, text, JSON.stringify(shapeFont)),
            'shape_with_face',
          );
        } finally {
          this.wasm.drop_face(oneShot);
        }
      }

      const faceHandle = this.getOrCreateFaceHandle(fontId);
      return this.mapShapeResult(
        this.wasm.shape_with_face(faceHandle, text, JSON.stringify(shapeFont)),
        'shape_with_face',
      );
    }

    if (this.fallbackShaper) {
      const bytes = this.fontBytesById.get(fontId);
      if (!bytes) {
        throw new Error(
          `WasmFontEngine: font bytes for '${fontId}' are not loaded`,
        );
      }
      return this.fallbackShaper({
        fontId,
        text,
        font: shapeFont,
        fontBytes: bytes,
      });
    }

    return this.mapShapeResult(
      this.wasm.shape_text_wasm(text, JSON.stringify(shapeFont)),
      'shape_text_wasm',
    );
  }

  // glyphForCodePoint intentionally omitted — WasmFontEngine shapes full strings via
  // shape_text_wasm; per-codepoint lookup is not needed by the rendering pipeline.
  // The FontEngine interface marks this method optional for this reason.

  // GSUB ligatures are applied by rustybuzz during shape_text_wasm — identity here
  applyLigatures(_fontId: string, glyphs: Glyph[]): Glyph[] {
    return glyphs;
  }

  // GSUB single substitution (sups/subs) is applied by rustybuzz via Font.variant — identity here
  applySingleSubstitution(
    _fontId: string,
    glyphs: Glyph[],
    _featureTag: 'sups' | 'subs',
  ): Glyph[] {
    return glyphs;
  }

  // GPOS kern is included in x_advance from shape_text_wasm — no separate adjustment needed
  getKerning(_fontId: string, _glyph1: Glyph, _glyph2: Glyph): number {
    return 0;
  }

  getGlyphPath(
    fontId: string,
    glyph: Glyph,
    x: number,
    y: number,
    fontSize: number,
  ): GlyphPath {
    const raw = JSON.parse(
      this.wasm.get_glyph_path(fontId, glyph.index, x, y, fontSize),
    );
    if ('error' in raw)
      throw new Error(`WasmFontEngine get_glyph_path: ${raw.error}`);

    const commands: PathCommand[] = raw.ok.commands;
    const d: string = raw.ok.d;

    return {
      commands,
      toSVG: (_precision?: number) => (d.length > 0 ? `<path d="${d}"/>` : ''),
      boundingBox: undefined,
    };
  }

  getFontMetrics(
    fontId: string,
    fontSize: number,
    variant?: 'normal' | 'superscript' | 'subscript',
  ): FontMetrics {
    const fontJson = JSON.stringify({
      id: fontId,
      size: fontSize,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
      variant,
    });
    const raw = JSON.parse(this.wasm.font_metrics_wasm(fontJson));
    if ('error' in raw)
      throw new Error(`WasmFontEngine font_metrics_wasm: ${raw.error}`);
    return raw.ok as FontMetrics;
  }
}
