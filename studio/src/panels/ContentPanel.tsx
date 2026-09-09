// ContentPanel.tsx — editable CodeMirror 6 XML editor for content.xml.
//
// Edits are written back to disk via window.studio.writeProjectFile with a
// 500ms debounce. The chokidar watcher triggers a recompile automatically.
// Errors with `file: 'content'` are applied as red-underline decorations.

import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { xml } from '@codemirror/lang-xml';
import {
  errorDecorationsExtension,
  setErrorsEffect,
} from '../codemirror/error-decorations.js';
import type { LineError } from '../codemirror/error-decorations.js';
import type { TemplatePanelError } from './TemplatePanel.js';
import { makeEditorTheme } from '../codemirror/editor-theme.js';

interface ContentPanelProps {
  /** Raw XML string content of content.xml. Null until a project is open. */
  content: string | null;
  /** Validation errors — only those with file === 'content' are applied. */
  errors?: TemplatePanelError[];
  /** Editor font size in px. Default: 12. */
  fontSize?: number;
  /** Show gutter line numbers. Default: false. */
  lineNumbers?: boolean;
}

export function ContentPanel({
  content,
  errors = [],
  fontSize = 12,
  lineNumbers = false,
}: ContentPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create / recreate editor when content or display settings change.
  useEffect(() => {
    if (!containerRef.current) return;

    viewRef.current?.destroy();

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        window.studio?.writeProjectFile('content.xml', text);
      }, 500);
    });

    const state = EditorState.create({
      doc: content ?? '',
      extensions: [
        ...makeEditorTheme({ fontSize, lineNumbers }),
        xml(),
        errorDecorationsExtension(),
        updateListener,
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [content, fontSize, lineNumbers]);

  // Apply error decorations when errors prop changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const lineErrors: LineError[] = errors
      .filter((e) => e.file === 'content')
      .map((e) => ({ line: e.line, message: e.message }));

    view.dispatch({
      effects: [setErrorsEffect.of(lineErrors)],
    });
  }, [errors]);

  return (
    <div
      data-testid='content-panel'
      style={{
        height: '100%',
        overflow: 'auto',
        background: '#1e1e1e',
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      <div ref={containerRef} style={{ height: '100%' }} />
    </div>
  );
}
