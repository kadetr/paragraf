// TemplatePanel.tsx — editable CodeMirror 6 JSON editor for template.json.
//
// - Content is passed as a `content` string prop; the editor is reinitialised
//   when that string changes.
// - Edits are written back to disk via window.studio.writeProjectFile with a
//   500ms debounce. The chokidar watcher triggers a recompile automatically.
// - Errors with `file: 'template'` are applied as red-underline decorations via
//   the errorDecorationsExtension.

import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import {
  errorDecorationsExtension,
  setErrorsEffect,
} from '../codemirror/error-decorations.js';
import type { LineError } from '../codemirror/error-decorations.js';
import { makeEditorTheme } from '../codemirror/editor-theme.js';

export interface TemplatePanelError {
  /** Discriminator: only errors for this file are applied. */
  file: 'template' | 'content';
  line: number;
  message: string;
}

interface TemplatePanelProps {
  /** Raw JSON string content of template.json. Null until a project is open. */
  content: string | null;
  /** Validation errors — only those with file === 'template' are applied. */
  errors?: TemplatePanelError[];
  /** Editor font size in px. Default: 12. */
  fontSize?: number;
  /** Show gutter line numbers. Default: false. */
  lineNumbers?: boolean;
}

export function TemplatePanel({
  content,
  errors = [],
  fontSize = 12,
  lineNumbers = false,
}: TemplatePanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create / recreate editor when content or display settings change.
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any previous instance.
    viewRef.current?.destroy();

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        window.studio?.writeProjectFile('template.json', text);
      }, 500);
    });

    const state = EditorState.create({
      doc: content ?? '',
      extensions: [
        ...makeEditorTheme({ fontSize, lineNumbers }),
        json(),
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

  // Apply error decorations whenever the errors prop changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const lineErrors: LineError[] = errors
      .filter((e) => e.file === 'template')
      .map((e) => ({ line: e.line, message: e.message }));

    view.dispatch({
      effects: [setErrorsEffect.of(lineErrors)],
    });
  }, [errors]);

  return (
    <div
      data-testid='template-panel'
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
