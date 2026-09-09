// StatusBar.tsx — bottom status strip showing compile state, page count,
// shaping engine, and studio version.
//
// All data comes from props — no IPC calls inside this component.

import React from 'react';

interface StatusBarProps {
  /** Validation errors; empty = no errors. */
  errors: { message: string }[];
  /** Number of pages in the last successful SVG result. 0 = no compile yet. */
  pageCount: number;
  /** Shaping engine string from the last compile result, e.g. "fontkit". */
  shapingEngine: string | null;
  /** Studio version string, e.g. "0.1.0". */
  version: string;
}

export function StatusBar({
  errors,
  pageCount,
  shapingEngine,
  version,
}: StatusBarProps): React.JSX.Element {
  const hasErrors = errors.length > 0;
  const statusEmoji = hasErrors ? '⚠' : '✓';

  return (
    <div
      data-testid='status-bar'
      style={{
        height: 24,
        background: hasErrors ? '#5a2d2d' : '#007acc',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        paddingInline: 12,
        fontSize: 11,
        gap: 16,
        flexShrink: 0,
      }}
    >
      <span data-testid='status-indicator'>
        {statusEmoji}
        {hasErrors && (
          <span data-testid='status-error-message' style={{ marginLeft: 4 }}>
            {errors[0].message}
          </span>
        )}
      </span>

      {pageCount > 0 && (
        <span data-testid='status-page-count'>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
      )}

      {shapingEngine && (
        <span data-testid='status-shaping-engine'>{shapingEngine}</span>
      )}

      <span style={{ flex: 1 }} />

      <span data-testid='status-version'>v{version}</span>
    </div>
  );
}
