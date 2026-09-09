// electron.main.ts — Electron main process.
//
// Responsibilities:
//   - BrowserWindow creation with contextBridge-only preload
//   - Folder open dialog
//   - chokidar file watcher (300ms debounce)
//   - worker_threads compile worker lifecycle
//   - IPC handlers bridging renderer requests to native APIs
//   - electron-store workspace persistence (dividerPositions, windowBounds)

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join, resolve, basename, relative } from 'path';
import { readFile, writeFile, rename } from 'fs/promises';
import { Worker } from 'worker_threads';
import chokidar from 'chokidar';
import Store from 'electron-store';

import type {
  CompileWorkerInput,
  CompileWorkerResult,
  ChangedFile,
  WorkspaceState,
} from './src/ipc-types.js';
import {
  validateStudioSchema,
  translateToTemplate,
  parseContentXml,
  computeFrameGeometry,
} from './src/schema/index.js';

// ─── electron-store ────────────────────────────────────────────────────────────

const store = new Store<WorkspaceState>({
  defaults: {
    dividerPositions: [280, 280],
    windowBounds: { width: 1440, height: 900, x: 100, y: 100 },
  },
});

// ─── Main window ───────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'Paragraf Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  mainWindow.on('closed', () => {
    terminateWorker();
    stopWatcher();
    mainWindow = null;
  });
}

function saveWindowBounds(): void {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getSize();
  const [x, y] = mainWindow.getPosition();
  store.set('windowBounds', { width, height, x, y });
}

// ─── Compile worker ────────────────────────────────────────────────────────────

let compileWorker: Worker | null = null;

function spawnWorker(projectPath: string): Worker {
  const workerPath = join(__dirname, '../main/compile.worker.js');
  const worker = new Worker(workerPath, {
    workerData: { projectPath },
  });

  worker.on('message', async (result: CompileWorkerResult) => {
    // Intercept PDF buffer — show a save dialog, write to chosen path.
    if (result.type === 'pdf') {
      if (!currentProjectPath || !mainWindow) return;
      const projectName = basename(currentProjectPath);
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
      const defaultName = `${projectName}-${ts}.pdf`;

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: join(currentProjectPath, defaultName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) return;

      await writeFile(
        filePath,
        (result as unknown as { type: 'pdf'; buffer: Buffer }).buffer,
      );
      shell.openPath(filePath);
      mainWindow?.webContents.send('compileResult', { type: 'pdf', filePath });
      return;
    }
    mainWindow?.webContents.send('compileResult', result);
  });

  worker.on('error', (err) => {
    console.error('[compile.worker] error:', err);
    mainWindow?.webContents.send('compileResult', {
      type: 'compile-error',
      message: err.message,
    } satisfies CompileWorkerResult);
  });

  return worker;
}

function terminateWorker(): void {
  compileWorker?.terminate();
  compileWorker = null;
}

// ─── File watcher ──────────────────────────────────────────────────────────────

let watcher: ReturnType<typeof chokidar.watch> | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let currentProjectPath: string | null = null;

/**
 * Filenames written by `writeProjectFile` IPC.
 * When the watcher fires for one of these, we skip the `fileChanged` event
 * to the renderer (the editor is already showing that content and would lose
 * its undo history if reinitialised). We still trigger a recompile.
 */
const ownWritePending = new Set<string>();

const FILE_MAP: Record<string, ChangedFile> = {
  'template.json': 'template',
  'content.xml': 'content',
  'data/sample.json': 'data',
};

function startWatcher(projectPath: string): void {
  stopWatcher();
  currentProjectPath = projectPath;

  const watchTargets = Object.keys(FILE_MAP).map((f) =>
    resolve(projectPath, f),
  );

  watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('change', (filePath: string) => {
    const rel = relative(projectPath, filePath);
    const changedFile = FILE_MAP[rel] ?? 'template';

    // If WE wrote this file, don't push the content back to the renderer —
    // the editor is already showing the correct state and would lose its
    // undo history if we reinitialised it from the disk copy.
    if (ownWritePending.has(rel)) {
      ownWritePending.delete(rel);
    } else {
      mainWindow?.webContents.send('fileChanged', changedFile);
    }

    // Always trigger a recompile so the preview stays current.
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerCompile(projectPath), 300);
  });
}

function stopWatcher(): void {
  watcher?.close();
  watcher = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ─── Compile trigger ───────────────────────────────────────────────────────────

async function triggerCompile(
  projectPath: string,
  outputOverride?: 'svg' | 'pdf',
): Promise<void> {
  if (!compileWorker) return;

  try {
    const templateJson = await readFile(
      resolve(projectPath, 'template.json'),
      'utf-8',
    );
    const raw: unknown = JSON.parse(templateJson);
    const schemaErrors = validateStudioSchema(raw);
    if (schemaErrors.length > 0) {
      compileWorker.postMessage({
        validationErrors: schemaErrors,
      } as CompileWorkerInput);
      return;
    }

    const studioTemplate = raw as Parameters<typeof translateToTemplate>[0];
    const {
      template,
      compileOptions,
      studioSettings,
      errors: translationErrors,
    } = translateToTemplate(studioTemplate);

    // Apply compile-level global overrides to every paragraph style.
    // `compile.hyphenation = false` disables hyphenation across all styles.
    // `compile.opticalMargins = true` enables OMA across all styles.
    // Safety net: ensure every style has an emergencyStretch so that narrow
    // column widths (e.g. 2-column layout) or WASM metric differences never
    // hard-fail the KP algorithm and crash the preview. User-specified values
    // are respected; this only fills in styles that omit it entirely.
    for (const style of Object.values(template.styles)) {
      if (studioSettings.hyphenation === false) style.hyphenation = false;
      if (studioSettings.opticalMargins === true)
        style.opticalMarginAlignment = true;
      if (style.emergencyStretch === undefined) style.emergencyStretch = 30;
    }

    // Read and parse content.xml to populate template.content.
    try {
      const contentXml = await readFile(
        resolve(projectPath, 'content.xml'),
        'utf-8',
      );
      const { slots } = parseContentXml(contentXml, studioTemplate);
      template.content = slots;
    } catch {
      // content.xml missing or malformed — compile with empty content
      template.content = [];
    }

    // Session key includes shaping so changing the engine busts the cache.
    // compile() ignores options.shaping when a session is provided — the
    // composer inside the session was built with the original engine.
    const fontsKey = JSON.stringify({
      fonts: (raw as Record<string, unknown>)['fonts'] ?? {},
      shaping: compileOptions.shaping ?? 'fontkit',
    });

    // Compute frame geometry for the overlay (SVG previews only).
    const frameGeometry =
      outputOverride !== 'pdf'
        ? computeFrameGeometry(studioTemplate)
        : undefined;

    const input: CompileWorkerInput = {
      template,
      options: {
        ...compileOptions,
        output: outputOverride ?? 'svg',
        // Suppress non-critical warnings during frequent SVG preview recompiles.
        // selectable has no effect on SVG; avoid flooding the console.
        verbose: false,
        ...(outputOverride === 'pdf' ? {} : { selectable: false }),
      },
      projectPath,
      fontsKey,
      validationErrors:
        translationErrors.length > 0 ? translationErrors : undefined,
      frameGeometry,
    };

    compileWorker.postMessage(input);
  } catch (err) {
    mainWindow?.webContents.send('compileResult', {
      type: 'compile-error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies CompileWorkerResult);
  }
}

// ─── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open Paragraf Project Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const projectPath = result.filePaths[0];

  // Terminate any existing worker before spawning a new one
  terminateWorker();
  compileWorker = spawnWorker(projectPath);
  startWatcher(projectPath);

  // Trigger initial compile
  await triggerCompile(projectPath);

  return projectPath;
});

const DEFAULT_TEMPLATE_JSON = JSON.stringify(
  {
    layout: { size: 'A4', margins: 72 },
    fonts: {},
    styles: {
      body: {
        font: { family: 'System', size: 12 },
        lineHeight: 18,
        alignment: 'left',
      },
    },
    frames: { body: { height: 'auto' } },
    pages: { default: { frames: ['body'] } },
    compile: { shaping: 'js', hyphenation: false },
  },
  null,
  2,
);

const DEFAULT_CONTENT_XML = `<content>
  <section frame="body">
    <p style="body">Start writing here.</p>
  </section>
</content>
`;

ipcMain.handle('newProject', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Folder for New Project',
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const projectPath = result.filePaths[0];

  await writeFile(
    join(projectPath, 'template.json'),
    DEFAULT_TEMPLATE_JSON,
    'utf-8',
  );
  await writeFile(
    join(projectPath, 'content.xml'),
    DEFAULT_CONTENT_XML,
    'utf-8',
  );

  terminateWorker();
  compileWorker = spawnWorker(projectPath);
  startWatcher(projectPath);
  await triggerCompile(projectPath);

  return projectPath;
});

ipcMain.handle('triggerPdfCompile', async () => {
  if (!currentProjectPath) return;
  await triggerCompile(currentProjectPath, 'pdf');
});

ipcMain.on('getWorkspaceState', (event) => {
  event.returnValue = {
    dividerPositions: store.get('dividerPositions'),
    windowBounds: store.get('windowBounds'),
  };
});

ipcMain.on('setWorkspaceState', (_event, state: Partial<WorkspaceState>) => {
  if (state.dividerPositions !== undefined) {
    store.set('dividerPositions', state.dividerPositions);
  }
  if (state.windowBounds !== undefined) {
    store.set('windowBounds', state.windowBounds);
  }
});

// Atomically patch compile[key] = value in template.json, then the file-watcher
// triggers a recompile (single source of truth; renderer never writes directly).
ipcMain.handle(
  'readProjectFile',
  async (_event, filename: string): Promise<string | null> => {
    if (!currentProjectPath) return null;
    // Prevent path traversal — normalize and ensure it stays inside projectPath.
    const resolved = resolve(currentProjectPath, filename);
    if (
      !resolved.startsWith(currentProjectPath + '/') &&
      resolved !== currentProjectPath
    ) {
      return null;
    }
    try {
      return await readFile(resolved, 'utf-8');
    } catch {
      return null;
    }
  },
);

ipcMain.handle(
  'writeProjectFile',
  async (_event, filename: string, content: string): Promise<boolean> => {
    if (!currentProjectPath) return false;
    // Prevent path traversal — normalize and ensure it stays inside projectPath.
    const resolved = resolve(currentProjectPath, filename);
    if (
      !resolved.startsWith(currentProjectPath + '/') &&
      resolved !== currentProjectPath
    ) {
      return false;
    }
    try {
      const tmpPath = resolved + '.tmp';
      await writeFile(tmpPath, content, 'utf-8');
      // Mark before rename so the watcher event (fired after rename) is suppressed.
      ownWritePending.add(relative(currentProjectPath, resolved));
      await rename(tmpPath, resolved);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  'setCompileSetting',
  async (_event, key: string, value: unknown) => {
    if (!currentProjectPath) return;
    const templatePath = join(currentProjectPath, 'template.json');
    const tmpPath = templatePath + '.tmp';
    const raw = JSON.parse(await readFile(templatePath, 'utf8'));
    if (typeof raw.compile !== 'object' || raw.compile === null) {
      raw.compile = {};
    }
    raw.compile[key] = value;
    await writeFile(tmpPath, JSON.stringify(raw, null, 2), 'utf8');
    await rename(tmpPath, templatePath);
  },
);

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
