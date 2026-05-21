// electron.preload.ts — contextBridge preload script.
//
// Exposes the IpcApi to the renderer under window.studio.
// This is the only file that imports Electron APIs in the renderer process.
// nodeIntegration is disabled; all communication happens through this bridge.

import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcApi,
  CompileWorkerResult,
  ChangedFile,
  WorkspaceState,
} from './src/ipc-types.js';

const api: IpcApi = {
  openFolder(): Promise<string | null> {
    return ipcRenderer.invoke('openFolder');
  },

  newProject(): Promise<string | null> {
    return ipcRenderer.invoke('newProject');
  },

  onCompileResult(cb: (result: CompileWorkerResult) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      result: CompileWorkerResult,
    ): void => cb(result);
    ipcRenderer.on('compileResult', handler);
    return () => ipcRenderer.removeListener('compileResult', handler);
  },

  onFileChanged(cb: (file: ChangedFile) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      file: ChangedFile,
    ): void => cb(file);
    ipcRenderer.on('fileChanged', handler);
    return () => ipcRenderer.removeListener('fileChanged', handler);
  },

  getWorkspaceState(): WorkspaceState {
    return ipcRenderer.sendSync('getWorkspaceState') as WorkspaceState;
  },

  setWorkspaceState(state: Partial<WorkspaceState>): void {
    ipcRenderer.send('setWorkspaceState', state);
  },

  triggerPdfCompile(): Promise<void> {
    return ipcRenderer.invoke('triggerPdfCompile');
  },

  setCompileSetting(key: string, value: unknown): Promise<void> {
    return ipcRenderer.invoke('setCompileSetting', key, value);
  },

  readProjectFile(filename: string): Promise<string | null> {
    return ipcRenderer.invoke('readProjectFile', filename);
  },

  writeProjectFile(filename: string, content: string): Promise<boolean> {
    return ipcRenderer.invoke('writeProjectFile', filename, content);
  },
};

contextBridge.exposeInMainWorld('studio', api);
