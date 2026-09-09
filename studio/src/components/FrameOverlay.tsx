// FrameOverlay.tsx — renders labeled SVG rect outlines over the preview page.
//
// Positioned absolutely at the same width/height as the rendered SVG page.
// One <rect> per frame, with a name label at top-left.
// Multi-column frames get N-1 dotted vertical guide lines.

import React from 'react';
import type { StudioFrameGeometry } from '../ipc-types.js';

interface FrameOverlayProps {
  frames: StudioFrameGeometry[];
  /** Pixel dimensions of the rendered SVG page (for the overlay <svg> element). */
  width: number;
  height: number;
}

const FRAME_COLOR = '#0099ff';
const LABEL_SIZE = 8;

export function FrameOverlay({
  frames,
  width,
  height,
}: FrameOverlayProps): React.JSX.Element {
  return (
    <svg
      data-testid='frame-overlay'
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
      }}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {frames.map((frame) => {
        const guides: React.JSX.Element[] = [];

        if (frame.columnCount > 1) {
          const colWidth =
            (frame.width - frame.columnGutter * (frame.columnCount - 1)) /
            frame.columnCount;
          for (let i = 1; i < frame.columnCount; i++) {
            const gx =
              frame.x +
              i * colWidth +
              (i - 1) * frame.columnGutter +
              frame.columnGutter / 2;
            guides.push(
              <line
                key={`guide-${frame.name}-${i}`}
                data-testid={`column-guide-${frame.name}-${i}`}
                x1={gx}
                y1={frame.y}
                x2={gx}
                y2={frame.y + frame.height}
                stroke={FRAME_COLOR}
                strokeWidth={0.5}
                strokeDasharray='3 3'
                opacity={0.7}
              />,
            );
          }
        }

        return (
          <g key={frame.name} data-testid={`frame-group-${frame.name}`}>
            <rect
              data-testid={`frame-rect-${frame.name}`}
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
              fill='none'
              stroke={FRAME_COLOR}
              strokeWidth={1}
              opacity={0.8}
            />
            <text
              data-testid={`frame-label-${frame.name}`}
              x={frame.x + 2}
              y={frame.y + LABEL_SIZE + 2}
              fontSize={LABEL_SIZE}
              fill={FRAME_COLOR}
              opacity={0.9}
            >
              {frame.name}
            </text>
            {guides}
          </g>
        );
      })}
    </svg>
  );
}
