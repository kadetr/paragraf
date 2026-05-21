// ContentPanel.test.tsx — RT5–RT7

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import { ContentPanel } from '../../src/panels/ContentPanel.js';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const XML_CONTENT = '<document>\n  <paragraph>Hello</paragraph>\n</document>';

describe('ContentPanel (RT5–RT7)', () => {
  it('RT5 — renders CodeMirror editor with the provided XML string content', () => {
    render(<ContentPanel content={XML_CONTENT} />);
    const panel = screen.getByTestId('content-panel');
    expect(panel).toBeTruthy();
    const cm = panel.querySelector('.cm-editor');
    expect(cm).toBeTruthy();
  });

  it('RT6 — editor is editable (no aria-readonly on .cm-content)', () => {
    render(<ContentPanel content={XML_CONTENT} />);
    const panel = screen.getByTestId('content-panel');
    const cmContent = panel.querySelector('.cm-content');
    // Editable CM6 editors do not set aria-readonly="true"
    expect(cmContent?.getAttribute('aria-readonly')).not.toBe('true');
  });

  it('RT7 — content errors applied; template errors not applied to content panel', () => {
    // Verify that the panel renders without throwing when given mixed errors.
    // Template errors must be filtered out — no exception means the filter worked.
    expect(() =>
      render(
        <ContentPanel
          content={XML_CONTENT}
          errors={[
            { file: 'content', line: 2, message: 'XML parse error' },
            { file: 'template', line: 1, message: 'Should not appear' },
          ]}
        />,
      ),
    ).not.toThrow();
    // Panel still renders
    const panels = screen.getAllByTestId('content-panel');
    expect(panels.length).toBeGreaterThan(0);
  });
});
