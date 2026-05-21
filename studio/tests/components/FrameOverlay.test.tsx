// FrameOverlay.test.tsx — RT7–RT9 for FrameOverlay component.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FrameOverlay } from '../../src/components/FrameOverlay.js';
import type { StudioFrameGeometry } from '../../src/ipc-types.js';

// ─── RT7 — one <rect> per frame ───────────────────────────────────────────────

describe('RT7 — renders one labeled <rect> per frame in geometry array', () => {
  it('renders rects for each frame', () => {
    const frames: StudioFrameGeometry[] = [
      {
        name: 'header',
        x: 72,
        y: 36,
        width: 468,
        height: 36,
        columnCount: 1,
        columnGutter: 0,
      },
      {
        name: 'body',
        x: 72,
        y: 90,
        width: 468,
        height: 630,
        columnCount: 1,
        columnGutter: 0,
      },
    ];

    render(<FrameOverlay frames={frames} width={612} height={792} />);

    expect(screen.getByTestId('frame-rect-header')).toBeInTheDocument();
    expect(screen.getByTestId('frame-rect-body')).toBeInTheDocument();
  });
});

// ─── RT8 — frame name label at top-left ──────────────────────────────────────

describe('RT8 — frame name label rendered at top-left of each rect', () => {
  it('shows the frame name as a text element', () => {
    const frames: StudioFrameGeometry[] = [
      {
        name: 'caption',
        x: 72,
        y: 400,
        width: 200,
        height: 50,
        columnCount: 1,
        columnGutter: 0,
      },
    ];

    render(<FrameOverlay frames={frames} width={612} height={792} />);

    const label = screen.getByTestId('frame-label-caption');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('caption');
  });
});

// ─── RT9 — multi-column guides ───────────────────────────────────────────────

describe('RT9 — multi-column frame: renders N-1 dotted vertical guide lines for N columns', () => {
  it('renders 2 guides for a 3-column frame', () => {
    const frames: StudioFrameGeometry[] = [
      {
        name: 'body',
        x: 72,
        y: 90,
        width: 468,
        height: 630,
        columnCount: 3,
        columnGutter: 12,
      },
    ];

    render(<FrameOverlay frames={frames} width={612} height={792} />);

    // 3 columns → 2 guide lines
    expect(screen.getByTestId('column-guide-body-1')).toBeInTheDocument();
    expect(screen.getByTestId('column-guide-body-2')).toBeInTheDocument();
    expect(screen.queryByTestId('column-guide-body-3')).not.toBeInTheDocument();
  });

  it('renders 0 guides for a 1-column frame', () => {
    const frames: StudioFrameGeometry[] = [
      {
        name: 'single',
        x: 72,
        y: 90,
        width: 468,
        height: 630,
        columnCount: 1,
        columnGutter: 0,
      },
    ];

    render(<FrameOverlay frames={frames} width={612} height={792} />);

    expect(
      screen.queryByTestId('column-guide-single-1'),
    ).not.toBeInTheDocument();
  });
});
