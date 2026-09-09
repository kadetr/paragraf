// StatusBar.test.tsx — RT8–RT11

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBar } from '../../src/components/StatusBar.js';

describe('StatusBar (RT8–RT11)', () => {
  it('RT8 — no errors → shows green/ok validation indicator (✓ symbol)', () => {
    render(
      <StatusBar
        errors={[]}
        pageCount={0}
        shapingEngine={null}
        version='0.1.0'
      />,
    );
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator.textContent).toContain('✓');
  });

  it('RT9 — one error → shows first error message text', () => {
    render(
      <StatusBar
        errors={[{ message: 'Missing required field: pages' }]}
        pageCount={0}
        shapingEngine={null}
        version='0.1.0'
      />,
    );
    const errMsg = screen.getByTestId('status-error-message');
    expect(errMsg.textContent).toContain('Missing required field: pages');
  });

  it('RT10 — shows page count from props', () => {
    render(
      <StatusBar
        errors={[]}
        pageCount={3}
        shapingEngine={null}
        version='0.1.0'
      />,
    );
    const pages = screen.getByTestId('status-page-count');
    expect(pages.textContent).toContain('3');
  });

  it('RT11 — shows shaping engine string from props', () => {
    render(
      <StatusBar
        errors={[]}
        pageCount={1}
        shapingEngine='harfbuzz'
        version='0.1.0'
      />,
    );
    const engine = screen.getByTestId('status-shaping-engine');
    expect(engine.textContent).toBe('harfbuzz');
  });
});
