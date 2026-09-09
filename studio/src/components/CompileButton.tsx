// CompileButton.tsx — "Compile!" button that triggers a full PDF compile.
//
// Disabled when:
//   - isCompiling is true (a compile is already in flight)
//   - hasErrors is true (template has validation errors, compile would fail)
//
// On click: calls window.studio.triggerPdfCompile() — the main process handles
// the compile and sends the result path back via IPC.

import React from 'react';

interface CompileButtonProps {
  isCompiling: boolean;
  hasErrors: boolean;
}

export function CompileButton({
  isCompiling,
  hasErrors,
}: CompileButtonProps): React.JSX.Element {
  const disabled = isCompiling || hasErrors;

  function handleClick(): void {
    window.studio?.triggerPdfCompile();
  }

  return (
    <button
      data-testid='compile-button'
      disabled={disabled}
      onClick={handleClick}
      style={{
        fontSize: 11,
        background: disabled ? '#333' : '#007acc',
        color: disabled ? '#666' : '#fff',
        border: 'none',
        borderRadius: 3,
        padding: '4px 12px',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {isCompiling ? 'Compiling…' : 'Compile!'}
    </button>
  );
}
