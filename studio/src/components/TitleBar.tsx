// TitleBar.tsx — Project name/path display, menu bar, and compile settings.
//
// Renders two rows at the same height as a single 40px bar:
//   Row 1 (title):   app name · project path · compile toggles · Export PDF
//   Row 2 (menubar): Open Folder · Split/Tabs toggle · Preview show/hide
//
// Each compile toggle calls window.studio.setCompileSetting(key, value) via IPC.
// This round-trips through the file system intentionally (single source of truth).

import React from 'react';

export interface CompileSettings {
  /** Which shaping engine to use: 'js' | 'wasm' */
  shaping?: 'js' | 'wasm';
  /** Optical margin alignment */
  opticalMargins?: boolean;
  /** Hyphenation */
  hyphenation?: boolean;
  /** Selectable text in PDF */
  selectable?: boolean;
}

interface TitleBarProps {
  projectName: string | null;
  projectPath: string | null;
  compileSettings: CompileSettings;
  editorLayout: 'split' | 'tabs';
  previewVisible: boolean;
  onEditorLayoutChange: (layout: 'split' | 'tabs') => void;
  onPreviewVisibleChange: (visible: boolean) => void;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onToggleEditorSettings: () => void;
}

declare global {
  interface Window {
    studio?: import('../ipc-types.js').IpcApi;
  }
}

export function TitleBar({
  projectName,
  projectPath,
  compileSettings,
  editorLayout,
  previewVisible,
  onEditorLayoutChange,
  onPreviewVisibleChange,
  onOpenFolder,
  onNewProject,
  onToggleEditorSettings,
}: TitleBarProps): React.JSX.Element {
  function set(key: string, value: unknown): void {
    window.studio?.setCompileSetting(key, value);
  }

  function exportPdf(): void {
    window.studio?.triggerPdfCompile();
  }

  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;

  return (
    <div
      data-testid='title-bar'
      style={{
        flexShrink: 0,
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
      }}
    >
      {/* ── Row 1: Title + compile settings ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          paddingInline: 16,
          gap: 16,
          ...drag,
        }}
      >
        {/* App / project identity */}
        <span
          data-testid='project-name'
          style={{ fontWeight: 600, fontSize: 13 }}
        >
          {projectName ?? 'Paragraf Studio'}
        </span>
        {projectPath && (
          <span
            data-testid='project-path'
            style={{ fontSize: 11, color: '#666', ...noDrag }}
          >
            {projectPath}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Compile settings — no-drag so controls are clickable */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, ...noDrag }}
        >
          {/* Shaping engine */}
          <label style={{ fontSize: 11, color: '#888' }}>
            Shaping
            <select
              data-testid='shaping-select'
              value={compileSettings.shaping ?? 'js'}
              onChange={(e) => set('shaping', e.target.value)}
              style={{
                marginLeft: 4,
                fontSize: 11,
                background: '#2d2d2d',
                color: '#ccc',
                border: '1px solid #444',
              }}
            >
              <option value='js'>JS</option>
              <option value='wasm'>WASM</option>
            </select>
          </label>

          {/* OMA */}
          <label
            style={{
              fontSize: 11,
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <input
              type='checkbox'
              data-testid='oma-checkbox'
              checked={compileSettings.opticalMargins ?? false}
              onChange={(e) => set('opticalMargins', e.target.checked)}
            />
            OMA
          </label>

          {/* Hyphenation */}
          <label
            style={{
              fontSize: 11,
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <input
              type='checkbox'
              data-testid='hyphenation-checkbox'
              checked={compileSettings.hyphenation ?? false}
              onChange={(e) => set('hyphenation', e.target.checked)}
            />
            Hyphenation
          </label>

          {/* Selectable — PDF only, so exposed as part of the Export PDF button */}
          <label
            title='Embed font data in the PDF so text can be selected and copied'
            style={{
              fontSize: 11,
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'help',
            }}
          >
            <input
              type='checkbox'
              data-testid='selectable-checkbox'
              checked={compileSettings.selectable ?? false}
              onChange={(e) => set('selectable', e.target.checked)}
            />
            Selectable
          </label>

          {/* Export PDF */}
          <button
            data-testid='export-pdf-button'
            onClick={exportPdf}
            title='Compile to PDF and save to project output/ folder'
            style={{
              fontSize: 11,
              background: '#007acc',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              padding: '3px 10px',
              cursor: 'pointer',
              ...noDrag,
            }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* ── Row 2: Menu bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 30,
          paddingInline: 8,
          gap: 2,
          background: '#252526',
          borderBottom: '1px solid #2a2a2a',
          ...drag,
        }}
      >
        {/* New Project */}
        <button
          data-testid='new-project-button'
          onClick={onNewProject}
          title='Create a new project'
          style={{
            fontSize: 12,
            background: 'transparent',
            color: '#ccc',
            border: 'none',
            borderRadius: 3,
            padding: '3px 10px',
            cursor: 'pointer',
            ...noDrag,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              '#37373d')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              'transparent')
          }
        >
          New…
        </button>

        {/* Open Folder */}
        <button
          data-testid='open-folder-button'
          onClick={onOpenFolder}
          title='Open a project folder'
          style={{
            fontSize: 12,
            background: 'transparent',
            color: '#ccc',
            border: 'none',
            borderRadius: 3,
            padding: '3px 10px',
            cursor: 'pointer',
            ...noDrag,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              '#37373d')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              'transparent')
          }
        >
          Open Folder…
        </button>

        <div
          style={{
            width: 1,
            height: 16,
            background: '#444',
            margin: '0 6px',
            flexShrink: 0,
          }}
        />

        {/* Split / Tabs toggle */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 1, ...noDrag }}
        >
          {(['split', 'tabs'] as const).map((mode) => (
            <button
              key={mode}
              data-testid={`layout-${mode}-button`}
              onClick={() => onEditorLayoutChange(mode)}
              title={
                mode === 'split'
                  ? 'Show Template and Content side by side'
                  : 'Show Template and Content in a single tabbed panel'
              }
              style={{
                fontSize: 11,
                padding: '2px 10px',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                background: editorLayout === mode ? '#007acc' : 'transparent',
                color: editorLayout === mode ? '#fff' : '#888',
                ...noDrag,
              }}
              onMouseEnter={(e) => {
                if (editorLayout !== mode)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    '#37373d';
              }}
              onMouseLeave={(e) => {
                if (editorLayout !== mode)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'transparent';
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Editor settings */}
        <button
          data-testid='editor-settings-button'
          onClick={onToggleEditorSettings}
          title='Editor settings'
          style={{
            fontSize: 14,
            background: 'transparent',
            color: '#888',
            border: 'none',
            borderRadius: 3,
            padding: '2px 8px',
            cursor: 'pointer',
            lineHeight: 1,
            ...noDrag,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              '#37373d')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              'transparent')
          }
        >
          ⚙
        </button>

        {/* Preview visibility toggle */}
        <button
          data-testid='preview-toggle-button'
          onClick={() => onPreviewVisibleChange(!previewVisible)}
          title={previewVisible ? 'Hide preview area' : 'Show preview area'}
          style={{
            fontSize: 11,
            padding: '2px 10px',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            background: previewVisible ? '#2f4f6f' : 'transparent',
            color: previewVisible ? '#fff' : '#888',
            ...noDrag,
          }}
          onMouseEnter={(e) => {
            if (!previewVisible)
              (e.currentTarget as HTMLButtonElement).style.background =
                '#37373d';
          }}
          onMouseLeave={(e) => {
            if (!previewVisible)
              (e.currentTarget as HTMLButtonElement).style.background =
                'transparent';
          }}
        >
          {previewVisible ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>
    </div>
  );
}
