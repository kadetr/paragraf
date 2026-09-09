// App.tsx — Paragraf Studio root layout.
//
// Wires useCompileWorker to PreviewPanel, TemplatePanel, ContentPanel,
// StatusBar, and CompileButton.  Plan 120 replaces the skeleton editor divs
// with real CodeMirror panels and wires the status bar.

import React, { useState, useEffect, useRef } from 'react';
import { useCompileWorker } from './hooks/useCompileWorker.js';
import { PreviewPanel } from './panels/PreviewPanel.js';
import { TemplatePanel } from './panels/TemplatePanel.js';
import { ContentPanel } from './panels/ContentPanel.js';
import { TitleBar } from './components/TitleBar.js';
import { StatusBar } from './components/StatusBar.js';
import { EditorSettings } from './components/EditorSettings.js';
import type { EditorSettingsValues } from './components/EditorSettings.js';
import type { CompileSettings } from './components/TitleBar.js';
import type { TemplatePanelError } from './panels/TemplatePanel.js';

const STUDIO_VERSION = '0.1.0';

export function App(): React.JSX.Element {
  const { result, isCompiling, lastError } = useCompileWorker();
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [templateContent, setTemplateContent] = useState<string | null>(null);
  const [contentXml, setContentXml] = useState<string | null>(null);

  // Editor display settings — persisted to localStorage.
  const [editorSettings, setEditorSettings] = useState<EditorSettingsValues>(
    () => {
      try {
        const stored = localStorage.getItem('editorSettings');
        return stored
          ? (JSON.parse(stored) as EditorSettingsValues)
          : { fontSize: 12, lineNumbers: false };
      } catch {
        return { fontSize: 12, lineNumbers: false };
      }
    },
  );
  const [editorSettingsOpen, setEditorSettingsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('editorSettings', JSON.stringify(editorSettings));
  }, [editorSettings]);

  // Editor layout mode: 'split' shows both panels side-by-side, 'tabs' merges them into one
  const [editorLayout, setEditorLayout] = useState<'split' | 'tabs'>('split');
  const [previewVisible, setPreviewVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'template' | 'content'>(
    'template',
  );

  // Panel widths — user can drag the dividers to resize
  const [templateWidth, setTemplateWidth] = useState(300);
  const [contentWidth, setContentWidth] = useState(360);
  // Combined editor width used in tab mode
  const [tabWidth, setTabWidth] = useState(480);
  const dragRef = useRef<{
    which: 'template' | 'content';
    startX: number;
    startWidth: number;
  } | null>(null);

  function startDrag(
    which: 'template' | 'content' | 'tab',
    e: React.MouseEvent,
  ): void {
    e.preventDefault();
    const startWidth =
      which === 'template'
        ? templateWidth
        : which === 'content'
          ? contentWidth
          : tabWidth;
    dragRef.current = {
      which: which as 'template' | 'content',
      startX: e.clientX,
      startWidth,
    };
    function onMove(ev: MouseEvent): void {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newW = Math.max(
        160,
        Math.min(900, dragRef.current.startWidth + delta),
      );
      if (which === 'template') setTemplateWidth(newW);
      else if (which === 'content') setContentWidth(newW);
      else setTabWidth(newW);
    }
    function onUp(): void {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const HANDLE_STYLE: React.CSSProperties = {
    width: 4,
    flexShrink: 0,
    cursor: 'col-resize',
    background: '#333',
    transition: 'background 0.1s',
  };

  // Derive project name from path (last segment)
  const projectName = projectPath
    ? (projectPath.split('/').filter(Boolean).pop() ?? null)
    : null;

  // Compile settings — kept in sync with template.json via IPC round-trip.
  const [compileSettings, setCompileSettings] = useState<CompileSettings>({
    shaping: 'js',
    opticalMargins: false,
    hyphenation: true,
    selectable: false,
  });

  // Re-derive compileSettings whenever templateContent changes (e.g. after
  // project open, external edit, or setCompileSetting IPC round-trip).
  useEffect(() => {
    if (!templateContent) return;
    try {
      const parsed = JSON.parse(templateContent) as Record<string, unknown>;
      const compile = (parsed['compile'] ?? {}) as Record<string, unknown>;
      setCompileSettings({
        shaping: (compile['shaping'] as CompileSettings['shaping']) ?? 'js',
        opticalMargins: (compile['opticalMargins'] as boolean) ?? false,
        hyphenation: (compile['hyphenation'] as boolean) ?? true,
        selectable: (compile['selectable'] as boolean) ?? false,
      });
    } catch {
      // JSON is being edited — keep the current displayed settings
    }
  }, [templateContent]);

  // Derive errors list for decorations + StatusBar.
  // ValidationError from IPC only has field/message; TemplatePanelError adds line+file.
  // For now, map errors to template errors (content errors need line info from worker).
  const errors: TemplatePanelError[] =
    result?.type === 'error'
      ? result.errors.map((e) => ({
          file: 'template' as const,
          // ValidationError has no line field yet — default to 1 until worker sends it.
          line: (e as { line?: number }).line ?? 1,
          message: e.message,
        }))
      : [];

  const hasErrors = errors.length > 0;

  const pageCount = result?.type === 'svg' ? result.svgPages.length : 0;

  const shapingEngine = compileSettings.shaping;

  async function handleOpenFolder(): Promise<void> {
    const path = await window.studio?.openFolder();
    if (!path) return;
    setProjectPath(path);
  }

  async function handleNewProject(): Promise<void> {
    const path = await window.studio?.newProject();
    if (!path) return;
    setProjectPath(path);
  }

  // Read a project file and update state.
  function loadProjectFiles(): void {
    window.studio?.readProjectFile('template.json').then((t) => {
      if (t !== null) setTemplateContent(t);
    });
    window.studio?.readProjectFile('content.xml').then((c) => {
      if (c !== null) setContentXml(c);
    });
  }

  // Read template.json and content.xml when project opens.
  useEffect(() => {
    if (!projectPath) return;
    loadProjectFiles();
  }, [projectPath]);

  // Re-read the changed file when the watcher fires.
  useEffect(() => {
    return window.studio?.onFileChanged((file) => {
      if (file === 'template') {
        window.studio?.readProjectFile('template.json').then((t) => {
          if (t !== null) setTemplateContent(t);
        });
      } else if (file === 'content') {
        window.studio?.readProjectFile('content.xml').then((c) => {
          if (c !== null) setContentXml(c);
        });
      }
    });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#1e1e1e',
        color: '#ccc',
      }}
    >
      <TitleBar
        projectName={projectName}
        projectPath={projectPath}
        compileSettings={compileSettings}
        editorLayout={editorLayout}
        previewVisible={previewVisible}
        onEditorLayoutChange={setEditorLayout}
        onPreviewVisibleChange={setPreviewVisible}
        onOpenFolder={handleOpenFolder}
        onNewProject={handleNewProject}
        onToggleEditorSettings={() => setEditorSettingsOpen((v) => !v)}
      />

      {editorSettingsOpen && (
        <EditorSettings
          settings={editorSettings}
          onChange={setEditorSettings}
          onClose={() => setEditorSettingsOpen(false)}
        />
      )}

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {editorLayout === 'split' ? (
          <>
            {/* ── SPLIT MODE ─────────────────────────────────── */}

            {/* Template panel */}
            <div
              style={{
                width: templateWidth,
                background: '#252526',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#888',
                  padding: '0 12px',
                  height: 30,
                  flexShrink: 0,
                  borderBottom: '1px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Template
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <TemplatePanel
                  content={templateContent}
                  errors={errors}
                  fontSize={editorSettings.fontSize}
                  lineNumbers={editorSettings.lineNumbers}
                />
              </div>
            </div>

            {/* Drag handle — Template | Content */}
            <div
              onMouseDown={(e) => startDrag('template', e)}
              style={HANDLE_STYLE}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.background =
                  '#007acc')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.background = '#333')
              }
            />

            {/* Content panel */}
            <div
              style={{
                width: previewVisible ? contentWidth : undefined,
                flex: previewVisible ? undefined : 1,
                background: '#1e1e1e',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: previewVisible ? 0 : 1,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#888',
                  padding: '0 12px',
                  height: 30,
                  flexShrink: 0,
                  borderBottom: '1px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Content
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ContentPanel
                  content={contentXml}
                  errors={errors}
                  fontSize={editorSettings.fontSize}
                  lineNumbers={editorSettings.lineNumbers}
                />
              </div>
            </div>

            {previewVisible && (
              <div
                onMouseDown={(e) => startDrag('content', e)}
                style={HANDLE_STYLE}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    '#007acc')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    '#333')
                }
              />
            )}
          </>
        ) : (
          <>
            {/* ── TAB MODE ───────────────────────────────────── */}

            <div
              style={{
                width: previewVisible ? tabWidth : undefined,
                flex: previewVisible ? undefined : 1,
                background: '#252526',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: previewVisible ? 0 : 1,
                overflow: 'hidden',
              }}
            >
              {/* Tab bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 30,
                  flexShrink: 0,
                  borderBottom: '1px solid #333',
                  background: '#1e1e1e',
                }}
              >
                {(['template', 'content'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      padding: '0 16px',
                      height: '100%',
                      border: 'none',
                      borderBottom:
                        activeTab === tab
                          ? '2px solid #007acc'
                          : '2px solid transparent',
                      background: activeTab === tab ? '#252526' : 'transparent',
                      color: activeTab === tab ? '#ccc' : '#666',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Panel body */}
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: activeTab === 'template' ? 'flex' : 'none',
                  flexDirection: 'column',
                }}
              >
                <TemplatePanel
                  content={templateContent}
                  errors={errors}
                  fontSize={editorSettings.fontSize}
                  lineNumbers={editorSettings.lineNumbers}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: activeTab === 'content' ? 'flex' : 'none',
                  flexDirection: 'column',
                }}
              >
                <ContentPanel
                  content={contentXml}
                  errors={errors}
                  fontSize={editorSettings.fontSize}
                  lineNumbers={editorSettings.lineNumbers}
                />
              </div>
            </div>

            {previewVisible && (
              <div
                onMouseDown={(e) => startDrag('tab', e)}
                style={HANDLE_STYLE}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    '#007acc')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    '#333')
                }
              />
            )}
          </>
        )}

        {previewVisible && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <PreviewPanel
              result={result}
              isCompiling={isCompiling}
              lastError={lastError}
            />
          </div>
        )}
      </div>

      <StatusBar
        errors={errors}
        pageCount={pageCount}
        shapingEngine={shapingEngine ?? null}
        version={STUDIO_VERSION}
      />
    </div>
  );
}
