// TitleBar.test.tsx — RT10–RT12 for TitleBar component.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TitleBar } from '../../src/components/TitleBar.js';
import type { CompileSettings } from '../../src/components/TitleBar.js';

// ─── RT10 — project name and path from props ──────────────────────────────────

describe('RT10 — project name and path displayed from props', () => {
  it('renders the project name and path', () => {
    render(
      <TitleBar
        projectName='my-book'
        projectPath='/Users/alice/Documents/my-book'
        compileSettings={{}}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByTestId('project-name')).toHaveTextContent('my-book');
    expect(screen.getByTestId('project-path')).toHaveTextContent(
      '/Users/alice/Documents/my-book',
    );
  });
});

// ─── RT11 — OMA checkbox reflects opticalMargins prop ────────────────────────

describe('RT11 — OMA checkbox checked state reflects compile.opticalMargins from props', () => {
  it('is checked when opticalMargins is true', () => {
    const settings: CompileSettings = { opticalMargins: true };
    render(
      <TitleBar
        projectName='x'
        projectPath={null}
        compileSettings={settings}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByTestId('oma-checkbox')).toBeChecked();
  });

  it('is unchecked when opticalMargins is false', () => {
    const settings: CompileSettings = { opticalMargins: false };
    render(
      <TitleBar
        projectName='x'
        projectPath={null}
        compileSettings={settings}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByTestId('oma-checkbox')).not.toBeChecked();
  });
});

// ─── RT12 — clicking OMA checkbox calls setCompileSetting ────────────────────

describe('RT12 — clicking OMA checkbox calls window.studio.setCompileSetting', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'studio', {
      configurable: true,
      value: {
        setCompileSetting: vi.fn().mockResolvedValue(undefined),
        openFolder: vi.fn(),
        onCompileResult: vi.fn(),
        onFileChanged: vi.fn(),
        getWorkspaceState: vi.fn(),
        setWorkspaceState: vi.fn(),
        triggerPdfCompile: vi.fn(),
      },
    });
  });

  it('calls setCompileSetting("opticalMargins", true) when checked', () => {
    const settings: CompileSettings = { opticalMargins: false };
    render(
      <TitleBar
        projectName='x'
        projectPath={null}
        compileSettings={settings}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('oma-checkbox'));

    expect(window.studio?.setCompileSetting).toHaveBeenCalledWith(
      'opticalMargins',
      true,
    );
  });

  it('calls setCompileSetting("opticalMargins", false) when unchecked', () => {
    const settings: CompileSettings = { opticalMargins: true };
    render(
      <TitleBar
        projectName='x'
        projectPath={null}
        compileSettings={settings}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('oma-checkbox'));

    expect(window.studio?.setCompileSetting).toHaveBeenCalledWith(
      'opticalMargins',
      false,
    );
  });
});

describe('preview toggle in menu bar', () => {
  it('calls onPreviewVisibleChange(false) when Hide Preview is clicked', () => {
    const onPreviewVisibleChange = vi.fn();
    render(
      <TitleBar
        projectName='x'
        projectPath={null}
        compileSettings={{}}
        editorLayout='split'
        previewVisible={true}
        onEditorLayoutChange={vi.fn()}
        onPreviewVisibleChange={onPreviewVisibleChange}
        onOpenFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preview-toggle-button'));
    expect(onPreviewVisibleChange).toHaveBeenCalledWith(false);
  });
});
