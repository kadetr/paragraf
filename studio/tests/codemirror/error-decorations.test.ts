// error-decorations.test.ts — RT15–RT17
//
// Tests the pure CM6 StateField logic without an EditorView.
// Uses EditorState.create directly — no DOM required.

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  errorDecorationsField,
  setErrorsEffect,
} from '../../src/codemirror/error-decorations.js';

/** Creates a fresh EditorState with the errorDecorationsField extension. */
function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [errorDecorationsField],
  });
}

/** Dispatch setErrorsEffect and return the new state. */
function applyErrors(
  state: EditorState,
  errors: { line: number; message: string }[],
): EditorState {
  return state.update({
    effects: [setErrorsEffect.of(errors)],
  }).state;
}

/** Count ranges in the DecorationSet. */
function countDecorations(state: EditorState): number {
  const decorations = state.field(errorDecorationsField);
  let count = 0;
  const cursor = decorations.iter();
  while (cursor.value !== null) {
    count++;
    cursor.next();
  }
  return count;
}

describe('error-decorations (RT15–RT17)', () => {
  it('RT15 — empty errors array → no decorations in StateField', () => {
    const state = createState('line one\nline two\nline three\n');
    const after = applyErrors(state, []);
    expect(countDecorations(after)).toBe(0);
  });

  it('RT16 — one error at line 3 → decoration spans line 3 range', () => {
    const doc = 'line one\nline two\nline three\n';
    const state = createState(doc);
    const after = applyErrors(state, [{ line: 3, message: 'syntax error' }]);

    const decorations = after.field(errorDecorationsField);
    const cursor = decorations.iter();
    expect(cursor.value).not.toBeNull();

    // Line 3 in CM6 (1-based) starts after the first two newlines.
    const line3 = after.doc.line(3);
    expect(cursor.from).toBe(line3.from);
    expect(cursor.to).toBe(line3.to);
  });

  it('RT17 — error at line beyond doc length → silently clamped / not added', () => {
    const doc = 'only one line\n';
    const state = createState(doc);
    // Line 99 doesn't exist — should not throw, should produce 0 decorations.
    expect(() => {
      const after = applyErrors(state, [{ line: 99, message: 'out of range' }]);
      expect(countDecorations(after)).toBe(0);
    }).not.toThrow();
  });
});
