// PreviewPanel.tsx — displays SVG compile results with page tabs and frame overlay.
//
// - Renders svgPages[activeTab] as inline HTML (dangerouslySetInnerHTML).
//   Safe because SVG comes from trusted local compile() output, not network.
// - Page tab bar only appears when svgPages.length > 1.
// - FrameOverlay toggle button shown in panel header; overlay positioned
//   absolutely over the rendered SVG.

import React, { useState, useRef, useEffect } from 'react';
import type { CompileWorkerResult, StudioFrameGeometry } from '../ipc-types.js';
import { FrameOverlay } from '../components/FrameOverlay.js';
import { StaleBanner } from '../components/StaleBanner.js';

interface PreviewPanelProps {
  result: CompileWorkerResult | null;
  isCompiling: boolean;
  /** When non-null, the preview is stale and this is the first error message. */
  lastError: string | null;
}

export function PreviewPanel({
  result,
  isCompiling,
  lastError,
}: PreviewPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  const svgPages = result?.type === 'svg' ? result.svgPages : null;
  const frameGeometry: StudioFrameGeometry[] =
    result?.type === 'svg' && result.frameGeometry ? result.frameGeometry : [];

  // Reset to first page when result changes
  useEffect(() => {
    setActiveTab(0);
  }, [svgPages]);

  // Measure SVG container after render to size the overlay
  useEffect(() => {
    if (!svgContainerRef.current) return;
    const el = svgContainerRef.current.querySelector('svg');
    if (el) {
      setSvgDimensions({
        width: el.clientWidth || el.scrollWidth,
        height: el.clientHeight || el.scrollHeight,
      });
    }
  }, [svgPages, activeTab]);

  return (
    <div
      data-testid='preview-panel'
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 32,
          paddingInline: 12,
          borderBottom: '1px solid #333',
          background: '#1e1e1e',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Preview
        </span>
        {isCompiling && (
          <span
            data-testid='compiling-indicator'
            style={{ fontSize: 11, color: '#888' }}
          >
            Compiling…
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          data-testid='toggle-overlay-button'
          onClick={() => setShowOverlay((v) => !v)}
          style={{
            fontSize: 11,
            background: showOverlay ? '#0099ff33' : 'transparent',
            border: '1px solid #444',
            color: '#ccc',
            borderRadius: 3,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Frames
        </button>
      </div>

      {/* Page tabs — only shown when multiple pages */}
      {svgPages && svgPages.length > 1 && (
        <div
          data-testid='page-tabs'
          style={{
            display: 'flex',
            background: '#252526',
            borderBottom: '1px solid #333',
            flexShrink: 0,
          }}
        >
          {svgPages.map((_, i) => (
            <button
              key={i}
              data-testid={`page-tab-${i + 1}`}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                background: activeTab === i ? '#1e1e1e' : 'transparent',
                border: 'none',
                borderRight: '1px solid #333',
                color: activeTab === i ? '#fff' : '#888',
                cursor: 'pointer',
              }}
            >
              Page {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Preview area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#c8c8c8',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Stale banner — shown when errors exist, preview remains visible below */}
        {lastError !== null && <StaleBanner message={lastError} />}

        {!svgPages && !isCompiling && (
          <div
            data-testid='empty-preview'
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#666',
              fontSize: 13,
            }}
          >
            Open a project folder to begin
          </div>
        )}

        {svgPages && (
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              margin: 24,
            }}
          >
            <div
              data-testid='svg-page'
              ref={svgContainerRef}
              // Safe: SVG is from local compile() — not user-supplied network content
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svgPages[activeTab] ?? '' }}
            />
            {showOverlay && frameGeometry.length > 0 && (
              <FrameOverlay
                frames={frameGeometry}
                width={svgDimensions.width}
                height={svgDimensions.height}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
