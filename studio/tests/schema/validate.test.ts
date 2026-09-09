import { describe, it, expect } from 'vitest';
import { validateStudioSchema } from '../../src/schema/validate.js';

// ─── Minimal valid fixture ────────────────────────────────────────────────────

const minimalValid = {
  layout: { size: 'A4', margins: 72 },
  fonts: { Serif: { regular: './Serif-Regular.ttf' } },
  styles: { body: { font: { family: 'Serif' }, fontSize: 12 } },
  frames: { main: { height: 'auto' } },
  pages: { default: { frames: ['main'] } },
};

// ─── RT1 ─────────────────────────────────────────────────────────────────────

describe('RT1 — valid minimal schema → no errors', () => {
  it('returns empty errors array for a valid minimal schema', () => {
    const errors = validateStudioSchema(minimalValid);
    expect(errors).toHaveLength(0);
  });
});

// ─── RT2 ─────────────────────────────────────────────────────────────────────

describe('RT2 — missing styles key → ValidationError with field path', () => {
  it('returns an error for missing "styles"', () => {
    const raw = { ...minimalValid, styles: undefined };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'styles');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/styles/i);
  });
});

// ─── RT3 ─────────────────────────────────────────────────────────────────────

describe('RT3 — missing frames key → ValidationError', () => {
  it('returns an error for missing "frames"', () => {
    const raw = { ...minimalValid, frames: undefined };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'frames');
    expect(err).toBeDefined();
  });
});

// ─── RT4 ─────────────────────────────────────────────────────────────────────

describe('RT4 — missing pages key → ValidationError', () => {
  it('returns an error for missing "pages"', () => {
    const raw = { ...minimalValid, pages: undefined };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'pages');
    expect(err).toBeDefined();
  });
});

// ─── RT5 ─────────────────────────────────────────────────────────────────────

describe('RT5 — page references frame not in frames registry → ValidationError', () => {
  it('errors when a page references an undefined frame name', () => {
    const raw = {
      ...minimalValid,
      pages: { default: { frames: ['main', 'nonexistent'] } },
    };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.message.includes('nonexistent'));
    expect(err).toBeDefined();
  });
});

// ─── RT6 ─────────────────────────────────────────────────────────────────────

describe('RT6 — style extends pointing to undefined name → ValidationError', () => {
  it('errors when a style extends an undefined style', () => {
    const raw = {
      ...minimalValid,
      styles: {
        body: { font: { family: 'Serif' }, fontSize: 12 },
        caption: { extends: 'missing-parent', fontSize: 10 },
      },
    };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'styles.caption.extends');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/missing-parent/);
  });
});

// ─── RT7 ─────────────────────────────────────────────────────────────────────

describe('RT7 — single height: "auto" frame per page → no error', () => {
  it('accepts exactly one auto frame per page', () => {
    const raw = {
      ...minimalValid,
      frames: {
        header: { height: '48pt' },
        main: { height: 'auto' },
      },
      pages: { default: { frames: ['header', 'main'] } },
    };
    const errors = validateStudioSchema(raw);
    expect(errors).toHaveLength(0);
  });
});

// ─── RT8 ─────────────────────────────────────────────────────────────────────

describe('RT8 — two height: "auto" frames on same page → ValidationError', () => {
  it('errors when two frames on the same page are auto', () => {
    const raw = {
      ...minimalValid,
      frames: {
        top: { height: 'auto' },
        bottom: { height: 'auto' },
      },
      pages: { default: { frames: ['top', 'bottom'] } },
    };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'pages.default');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/auto/i);
  });
});

// ─── RT9 ─────────────────────────────────────────────────────────────────────

describe('RT9 — compile section with key "fontFeatures" (not in allowlist) → ValidationError', () => {
  it('errors when compile section contains key "fontFeatures"', () => {
    const raw = {
      ...minimalValid,
      compile: { fontFeatures: { liga: true } },
    };
    const errors = validateStudioSchema(raw);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'compile.fontFeatures');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/fontFeatures/);
  });
});

// ─── RT10 ────────────────────────────────────────────────────────────────────

describe('RT10 — valid full schema (all sections populated) → no errors', () => {
  it('accepts a fully populated valid schema', () => {
    const full = {
      layout: {
        size: 'A4',
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      fonts: {
        Serif: {
          regular: './Serif-Regular.ttf',
          bold: './Serif-Bold.ttf',
        },
      },
      styles: {
        body: { font: { family: 'Serif' }, fontSize: 12 },
        caption: { extends: 'body', fontSize: 9 },
      },
      frames: {
        header: { height: '48pt' },
        main: { height: 'auto' },
        footer: { height: '36pt' },
      },
      pages: {
        first: { frames: ['header', 'main', 'footer'] },
        default: { frames: ['main', 'footer'] },
      },
      compile: {
        shaping: 'wasm',
        selectable: true,
        maxPages: 10,
      },
    };
    const errors = validateStudioSchema(full);
    expect(errors).toHaveLength(0);
  });
});
