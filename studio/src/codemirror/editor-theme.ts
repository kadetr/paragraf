// editor-theme.ts — CodeMirror 6 dark theme with configurable font size and
// optional line numbers.
//
// Fixes the invisible cursor issue: CodeMirror's default cursor is black, which
// is invisible on a dark background.  This theme sets an explicit light cursor.

import { EditorView, lineNumbers as cmLineNumbers } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface EditorThemeOptions {
  /** Font size in px for the editor content.  Default: 12. */
  fontSize: number;
  /** Show gutter line numbers. Default: false. */
  lineNumbers: boolean;
}

/**
 * Returns a CM6 extension array for the studio dark theme.
 *
 * Include in `EditorState.create({ extensions: [...makeEditorTheme(opts)] })`.
 * Recreate the editor (or use a Compartment) when options change.
 */
export function makeEditorTheme(opts: EditorThemeOptions): Extension[] {
  const theme = EditorView.theme({
    // ── Container ─────────────────────────────────────────────────────────
    '&': {
      fontSize: `${opts.fontSize}px`,
      height: '100%',
    },

    // ── Content / cursor ──────────────────────────────────────────────────
    '.cm-content': {
      caretColor: '#aeafad',
      padding: '4px 0',
      fontFamily:
        'ui-monospace, "Cascadia Code", "Fira Code", Menlo, Monaco, "Courier New", monospace',
    },
    // Unfocused cursor: muted light
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#aeafad',
      borderLeftWidth: '2px',
    },
    // Focused cursor: white
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#ffffff',
    },

    // ── Selection ─────────────────────────────────────────────────────────
    '.cm-selectionBackground': {
      background: '#264f78 !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      background: '#264f78 !important',
    },

    // ── Active line ───────────────────────────────────────────────────────
    '.cm-activeLine': {
      backgroundColor: 'rgba(42, 45, 46, 0.35)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2a2d2e',
    },

    // ── Gutters (line numbers) ─────────────────────────────────────────────
    '.cm-gutters': {
      background: '#1a1a1a',
      color: '#4d4d4d',
      borderRight: '1px solid #2d2d2d',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },

    // ── Focus ring ────────────────────────────────────────────────────────
    '&.cm-focused': {
      outline: 'none',
    },

    // ── Error underline (used by error-decorations.ts) ────────────────────
    '.cm-error-underline': {
      textDecoration: 'underline wavy #f44747',
    },
  });

  const exts: Extension[] = [theme];
  if (opts.lineNumbers) exts.push(cmLineNumbers());
  return exts;
}
