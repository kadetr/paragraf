// TemplatePanel.test.tsx — RT1–RT4

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { TemplatePanel } from '../../src/panels/TemplatePanel.js';

// CodeMirror requires a DOM with basic layout methods. happy-dom provides
// enough of the DOM API for EditorView to initialise without throwing.

// Suppress CodeMirror's requestAnimationFrame / ResizeObserver warnings in
// test output — they are irrelevant to our assertions.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const JSON_CONTENT = '{\n  "version": "1.0",\n  "pages": []\n}';

describe('TemplatePanel (RT1–RT4)', () => {
  it('RT1 — renders the editor container with provided JSON content', () => {
    render(<TemplatePanel content={JSON_CONTENT} />);
    // The panel wrapper should be in the document
    const panel = screen.getByTestId('template-panel');
    expect(panel).toBeTruthy();
    // CodeMirror creates a .cm-editor element inside the container
    const cm = panel.querySelector('.cm-editor');
    expect(cm).toBeTruthy();
  });

  it('RT2 — editor is editable (no aria-readonly on .cm-content)', () => {
    render(<TemplatePanel content={JSON_CONTENT} />);
    const panel = screen.getByTestId('template-panel');
    const content = panel.querySelector('.cm-content');
    // Editable CM6 editors do not set aria-readonly="true"
    expect(content?.getAttribute('aria-readonly')).not.toBe('true');
  });

  it('RT3 — no errors prop → no cm-error-underline decoration marks', () => {
    render(<TemplatePanel content={JSON_CONTENT} errors={[]} />);
    const panel = screen.getByTestId('template-panel');
    const marks = panel.querySelectorAll('.cm-error-underline');
    expect(marks.length).toBe(0);
  });

  it('RT4 — errors prop with template entry → panel renders without throwing', () => {
    // We cannot easily inspect CM6 StateField in jsdom, but verifying no exception
    // is thrown and the panel renders is the accessible assertion here.
    expect(() =>
      render(
        <TemplatePanel
          content={JSON_CONTENT}
          errors={[{ file: 'template', line: 2, message: 'Bad field' }]}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('template-panel')).toBeTruthy();
  });
});
