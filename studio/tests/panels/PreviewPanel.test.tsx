// PreviewPanel.test.tsx — RT1–RT6 for PreviewPanel component.
//
// Uses @testing-library/react with happy-dom environment.
// Mocks useCompileWorker via vi.mock so PreviewPanel can be tested in isolation.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewPanel } from '../../src/panels/PreviewPanel.js';
import type { CompileWorkerResult } from '../../src/ipc-types.js';

// ─── RT1 — SVG string rendered on first load ──────────────────────────────────

describe('RT1 — renders SVG string inside preview div (first page shown by default)', () => {
  it('injects the first SVG page as innerHTML', () => {
    const result: CompileWorkerResult = {
      type: 'svg',
      svgPages: [
        '<svg data-testid="page1"><rect/></svg>',
        '<svg data-testid="page2"/>',
      ],
    };

    render(<PreviewPanel result={result} isCompiling={false} />);

    const pageDiv = screen.getByTestId('svg-page');
    expect(pageDiv.innerHTML).toContain('data-testid="page1"');
    expect(pageDiv.innerHTML).not.toContain('data-testid="page2"');
  });
});

// ─── RT2 — loading state while isCompiling is true ───────────────────────────

describe('RT2 — shows loading state while isCompiling is true', () => {
  it('renders the compiling indicator', () => {
    render(<PreviewPanel result={null} isCompiling={true} />);

    expect(screen.getByTestId('compiling-indicator')).toBeInTheDocument();
  });
});

// ─── RT3 — single page: no tab bar ───────────────────────────────────────────

describe('RT3 — single page → no tab bar rendered', () => {
  it('does not render page tabs for a single page', () => {
    const result: CompileWorkerResult = {
      type: 'svg',
      svgPages: ['<svg/>'],
    };

    render(<PreviewPanel result={result} isCompiling={false} />);

    expect(screen.queryByTestId('page-tabs')).not.toBeInTheDocument();
  });
});

// ─── RT4 — multiple pages: tab bar, tab switching ────────────────────────────

describe('RT4 — multiple pages → tab bar with correct count; clicking Page 2 shows second SVG', () => {
  it('renders two tabs and switches page content on click', () => {
    const result: CompileWorkerResult = {
      type: 'svg',
      svgPages: ['<svg id="p1"/>', '<svg id="p2"/>'],
    };

    render(<PreviewPanel result={result} isCompiling={false} />);

    expect(screen.getByTestId('page-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('page-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('page-tab-2')).toBeInTheDocument();

    const pageDiv = screen.getByTestId('svg-page');
    expect(pageDiv.innerHTML).toContain('id="p1"');

    fireEvent.click(screen.getByTestId('page-tab-2'));
    expect(pageDiv.innerHTML).toContain('id="p2"');
    expect(pageDiv.innerHTML).not.toContain('id="p1"');
  });
});

// ─── RT5 — frame overlay toggle button ───────────────────────────────────────

describe('RT5 — frame overlay button toggles overlay visibility', () => {
  it('shows overlay when toggled on', () => {
    const result: CompileWorkerResult = {
      type: 'svg',
      svgPages: ['<svg/>'],
      frameGeometry: [
        {
          name: 'body',
          x: 72,
          y: 72,
          width: 400,
          height: 600,
          columnCount: 1,
          columnGutter: 0,
        },
      ],
    };

    render(<PreviewPanel result={result} isCompiling={false} />);

    // Overlay not visible initially
    expect(screen.queryByTestId('frame-overlay')).not.toBeInTheDocument();

    // Click toggle
    fireEvent.click(screen.getByTestId('toggle-overlay-button'));
    expect(screen.getByTestId('frame-overlay')).toBeInTheDocument();

    // Click again to hide
    fireEvent.click(screen.getByTestId('toggle-overlay-button'));
    expect(screen.queryByTestId('frame-overlay')).not.toBeInTheDocument();
  });
});

// ─── RT6 — null result: placeholder message, no SVG ──────────────────────────

describe('RT6 — when result is null → placeholder message rendered, no SVG', () => {
  it('shows empty-preview placeholder and no svg-page div', () => {
    render(<PreviewPanel result={null} isCompiling={false} />);

    expect(screen.getByTestId('empty-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('svg-page')).not.toBeInTheDocument();
  });
});
