// tests/output-intent.test.ts
//
// TDD tests for OutputIntent threading through compile() and compileBatch().
// workId 011: compile compliance mode (PDF/X).

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compile } from '../src/compile.js';
import { compileBatch } from '../src/batch.js';
import { loadBuiltinSrgb, createColorManager } from '@paragraf/color';
import type { OutputIntent } from '@paragraf/render-pdf';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeTemplate() {
  return defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'left',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{text}}' }],
  });
}

const SAMPLE_DATA = { text: 'Hello world.' };

let intent: OutputIntent;

beforeAll(() => {
  const profile = loadBuiltinSrgb();
  intent = createColorManager().getOutputIntent(profile, 'sRGB');
});

const isPdfHeader = (buf: Buffer): boolean =>
  buf.toString('ascii', 0, 5) === '%PDF-';

const containsStr = (buf: Buffer, str: string): boolean =>
  buf.toString('latin1').includes(str);

// ─── 1. Backward compat ───────────────────────────────────────────────────────

describe('compile() — outputIntent absent (backward compat)', () => {
  it('returns a valid PDF Buffer when outputIntent is not set', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });
    expect(result.data).toBeInstanceOf(Buffer);
    expect(isPdfHeader(result.data as Buffer)).toBe(true);
  });
});

// ─── 2–5. compile() with outputIntent, output: 'pdf' ─────────────────────────

describe('compile() — outputIntent present, output: pdf', () => {
  it('data is a Buffer', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(result.data).toBeInstanceOf(Buffer);
  });

  it('Buffer starts with %PDF- magic bytes', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(isPdfHeader(result.data as Buffer)).toBe(true);
  });

  it('Buffer contains /OutputIntents', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(containsStr(result.data as Buffer, '/OutputIntents')).toBe(true);
  });

  it('Buffer contains the condition identifier string', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(containsStr(result.data as Buffer, 'sRGB')).toBe(true);
  });
});

// ─── 6–7. outputIntent with output: 'svg' ────────────────────────────────────

describe('compile() — outputIntent with output: svg', () => {
  it('emits a console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('outputIntent'),
    );
    warnSpy.mockRestore();
  });

  it('still returns an SVG string (no throw)', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    expect(typeof result.data).toBe('string');
    expect(result.data as string).toContain('<svg');
  });
});

// ─── 8. compileBatch with outputIntent ───────────────────────────────────────

describe('compileBatch() — outputIntent present', () => {
  it('each result Buffer contains /OutputIntents', async () => {
    const results = await compileBatch({
      template: makeTemplate(),
      records: [{ text: 'Record one.' }, { text: 'Record two.' }],
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
    });
    for (const r of results) {
      expect(r.result).toBeDefined();
      expect(containsStr(r.result!.data as Buffer, '/OutputIntents')).toBe(
        true,
      );
    }
  });
});
