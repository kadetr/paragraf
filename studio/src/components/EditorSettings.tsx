// EditorSettings.tsx — compact popover for editor display settings.
//
// Rendered as a floating panel near the gear button.
// All state lives in the parent (App) so settings survive panel
// re-mounts and can be persisted via localStorage.

import React from 'react';

export interface EditorSettingsValues {
  /** Font size in px for the CodeMirror editors.  Range: 10–24. */
  fontSize: number;
  /** Show gutter line numbers in both editors. */
  lineNumbers: boolean;
}

interface EditorSettingsProps {
  settings: EditorSettingsValues;
  onChange: (settings: EditorSettingsValues) => void;
  onClose: () => void;
}

const BTN: React.CSSProperties = {
  width: 22,
  height: 22,
  background: '#3a3a3a',
  border: '1px solid #555',
  color: '#ccc',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function EditorSettings({
  settings,
  onChange,
  onClose,
}: EditorSettingsProps): React.JSX.Element {
  function set<K extends keyof EditorSettingsValues>(
    key: K,
    value: EditorSettingsValues[K],
  ): void {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div
      data-testid='editor-settings-popover'
      style={{
        position: 'absolute',
        top: 71,
        right: 8,
        background: '#252526',
        border: '1px solid #444',
        borderRadius: 4,
        padding: '12px 14px',
        zIndex: 1000,
        minWidth: 180,
        boxShadow: '0 4px 16px rgba(0,0,0,0.65)',
        color: '#ccc',
        fontSize: 12,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: '#888',
          }}
        >
          Editor
        </span>
        <button
          onClick={onClose}
          title='Close settings'
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Font size ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ flex: 1 }}>Font size</span>
        <button
          onClick={() => set('fontSize', Math.max(10, settings.fontSize - 1))}
          style={BTN}
          title='Decrease font size'
        >
          −
        </button>
        <span
          style={{
            minWidth: 20,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {settings.fontSize}
        </span>
        <button
          onClick={() => set('fontSize', Math.min(24, settings.fontSize + 1))}
          style={BTN}
          title='Increase font size'
        >
          +
        </button>
      </div>

      {/* ── Line numbers ────────────────────────────────────────────── */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type='checkbox'
          checked={settings.lineNumbers}
          onChange={(e) => set('lineNumbers', e.target.checked)}
        />
        Line numbers
      </label>
    </div>
  );
}
