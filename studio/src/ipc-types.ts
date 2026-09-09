// ipc-types.ts — Shared IPC contract between main process, preload, and renderer.
//
// This file must import only types — never Electron or Node APIs —
// so it is safe to import in the renderer process.

import type { ValidationError } from './schema/types.js';
import type { CompileOptions, Template } from '@paragraf/compile';

// ─── Frame geometry ───────────────────────────────────────────────────────────

/**
 * Geometry for a single frame, used to render the FrameOverlay in the preview.
 * Coordinates are in points (same as SVG output units).
 */
export interface StudioFrameGeometry {
  /** Frame identifier (e.g. "body", "header"). */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Number of columns. When > 1, N-1 vertical guide lines are drawn. */
  columnCount: number;
  /** Gutter width between columns in points. */
  columnGutter: number;
}

// ─── Worker input / output types ─────────────────────────────────────────────

/** Message sent from main process to compile.worker.ts. */
export interface CompileWorkerInput {
  /** Resolved Template object (already translated by translateToTemplate). */
  template: Template;
  /** Compile options excluding template (passed separately). */
  options: Omit<CompileOptions, 'template'>;
  /** Absolute path to the project folder, used as basePath for font resolution. */
  projectPath: string;
  /** Serialised template.fonts JSON — used to detect session invalidation. */
  fontsKey: string;
  /**
   * Pre-computed validation errors from validateStudioSchema / translateToTemplate.
   * When non-empty the worker returns { type: 'error', errors } immediately without
   * calling compile(). This keeps the worker as the single result-posting point.
   */
  validationErrors?: ValidationError[];
  /**
   * Pre-computed frame geometry for the overlay panel.
   * Computed in the main process from computeFrameGeometry() and echoed back
   * in the { type: 'svg' } result so the renderer can display the FrameOverlay.
   */
  frameGeometry?: StudioFrameGeometry[];
}

/** Result posted back from compile.worker.ts to the main process. */
export type CompileWorkerResult =
  | { type: 'svg'; svgPages: string[]; frameGeometry?: StudioFrameGeometry[] }
  | { type: 'pdf'; filePath: string }
  | { type: 'error'; errors: ValidationError[] }
  | { type: 'compile-error'; message: string };

// ─── Workspace state ──────────────────────────────────────────────────────────

/** Persisted via electron-store. NOT stored in the project file. */
export interface WorkspaceState {
  dividerPositions: [number, number];
  windowBounds: { width: number; height: number; x: number; y: number };
}

// ─── File-changed event ───────────────────────────────────────────────────────

/** Which project file changed — sent from main to renderer via onFileChanged. */
export type ChangedFile = 'template' | 'content' | 'data';

// ─── IPC API (contextBridge contract) ────────────────────────────────────────

/**
 * The full IPC surface exposed to the renderer via contextBridge.
 * Defined here so both electron.preload.ts and renderer hooks share one type.
 */
export interface IpcApi {
  /** Show the native open-folder dialog. Returns the selected path, or null if cancelled. */
  openFolder(): Promise<string | null>;
  /**
   * Show a dialog to choose a folder, scaffold template.json + content.xml
   * inside it, and open it as a new project.  Returns the project path, or null
   * if the user cancelled.
   */
  newProject(): Promise<string | null>;
  /**
   * Register a listener for compile results from the worker.
   * Returns an unsubscribe function — call it in React effect cleanup.
   */
  onCompileResult(cb: (result: CompileWorkerResult) => void): () => void;
  /**
   * Register a listener for file-change notifications.
   * Returns an unsubscribe function — call it in React effect cleanup.
   */
  onFileChanged(cb: (file: ChangedFile) => void): () => void;
  /** Return the current persisted workspace state. */
  getWorkspaceState(): WorkspaceState;
  /** Persist a partial workspace state update. */
  setWorkspaceState(state: Partial<WorkspaceState>): void;
  /** Trigger a PDF compile manually (e.g. from Save PDF menu action). */
  triggerPdfCompile(): Promise<void>;
  /**
   * Patch a single compile setting in template.json on disk.
   * The main process updates `compile[key] = value` atomically and the
   * file-watcher triggers a recompile. The renderer does not write directly.
   */
  setCompileSetting(key: string, value: unknown): Promise<void>;
  /** Read a project file by name (e.g. 'template.json', 'content.xml'). Returns the raw UTF-8 string. */
  readProjectFile(filename: string): Promise<string | null>;
  /** Write a project file by name. Returns true on success. */
  writeProjectFile(filename: string, content: string): Promise<boolean>;
}
