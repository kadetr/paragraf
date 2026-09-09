import { contextBridge, ipcRenderer } from "electron";
//#region electron.preload.ts
contextBridge.exposeInMainWorld("studio", {
	openFolder() {
		return ipcRenderer.invoke("openFolder");
	},
	newProject() {
		return ipcRenderer.invoke("newProject");
	},
	onCompileResult(cb) {
		const handler = (_event, result) => cb(result);
		ipcRenderer.on("compileResult", handler);
		return () => ipcRenderer.removeListener("compileResult", handler);
	},
	onFileChanged(cb) {
		const handler = (_event, file) => cb(file);
		ipcRenderer.on("fileChanged", handler);
		return () => ipcRenderer.removeListener("fileChanged", handler);
	},
	getWorkspaceState() {
		return ipcRenderer.sendSync("getWorkspaceState");
	},
	setWorkspaceState(state) {
		ipcRenderer.send("setWorkspaceState", state);
	},
	triggerPdfCompile() {
		return ipcRenderer.invoke("triggerPdfCompile");
	},
	setCompileSetting(key, value) {
		return ipcRenderer.invoke("setCompileSetting", key, value);
	},
	readProjectFile(filename) {
		return ipcRenderer.invoke("readProjectFile", filename);
	},
	writeProjectFile(filename, content) {
		return ipcRenderer.invoke("writeProjectFile", filename, content);
	}
});
//#endregion
export {};
