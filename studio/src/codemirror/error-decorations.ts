// error-decorations.ts — CodeMirror 6 extension that underlines lines reported
// by the compile worker's ValidationError list.
//
// Design:
//   - `setErrorsEffect`          — StateEffect to dispatch a new error list.
//   - `errorDecorationsField`    — StateField<DecorationSet> that builds
//                                  Decoration.mark ranges from the error list.
//   - `errorDecorationsExtension`— Returns the full CM6 extension array that
//                                  both holds the field and provides decorations
//                                  to the view.
//
// The field deliberately avoids `provide` so it can be tested without a live
// EditorView.  `errorDecorationsExtension()` adds `EditorView.decorations.from`
// separately, keeping the function testable in a Node environment.

import { StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Minimal error shape required by this module.
 * Compatible with (a superset of) `ValidationError` from `../schema/types.js`.
 */
export interface LineError {
  /** 1-based line number. */
  line: number;
  message: string;
}

// ─── Effect ───────────────────────────────────────────────────────────────────

/** Dispatch this effect to replace the active error list. */
export const setErrorsEffect = StateEffect.define<LineError[]>();

// ─── Decoration ───────────────────────────────────────────────────────────────

const errorMark = Decoration.mark({ class: 'cm-error-underline' });

// ─── StateField ───────────────────────────────────────────────────────────────

/**
 * Holds the current DecorationSet derived from the last `setErrorsEffect`.
 * Can be read in tests directly from `state.field(errorDecorationsField)`.
 */
export const errorDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorsEffect)) {
        const errors = effect.value;
        const ranges: ReturnType<typeof errorMark.range>[] = [];
        for (const err of errors) {
          // Silently skip errors at lines outside the document.
          if (err.line < 1 || err.line > tr.newDoc.lines) continue;
          const line = tr.newDoc.line(err.line);
          // Clamp to non-empty range; for blank lines range(from, from) is still valid.
          ranges.push(
            errorMark.range(
              line.from,
              line.to > line.from ? line.to : line.from,
            ),
          );
        }
        // Decoration.set requires ranges sorted by from position.
        ranges.sort((a, b) => a.from - b.from);
        return Decoration.set(ranges);
      }
    }
    // Map decorations through any document changes.
    return decorations.map(tr.changes);
  },
});

// ─── Full extension ───────────────────────────────────────────────────────────

/**
 * Returns the complete CM6 extension array: the StateField + the decoration
 * provider facet.  Pass this to `EditorState.create({ extensions })`.
 */
export function errorDecorationsExtension(): Extension {
  return [
    errorDecorationsField,
    EditorView.decorations.from(errorDecorationsField),
  ];
}
