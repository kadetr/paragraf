// StaleBanner.tsx — amber warning bar shown above the preview SVG when the
// last compile produced errors.  The last valid preview remains visible below.

import React from 'react';

interface StaleBannerProps {
  /** First error message to display. */
  message: string;
}

export function StaleBanner({ message }: StaleBannerProps): React.JSX.Element {
  return (
    <div
      data-testid='stale-banner'
      style={{
        background: '#b08000',
        color: '#fff',
        padding: '4px 12px',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      Preview stale — template has errors
      {message && (
        <span style={{ marginLeft: 8, opacity: 0.85 }}>({message})</span>
      )}
    </div>
  );
}
