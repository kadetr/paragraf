import { contextBridge, ipcRenderer } from "electron";
//#region electron.preload.ts
contextBridge.exposeInMainWorld("studio", {
	openFolder() {
		return ipcRenderer.invoke("openFolder");
	},
	onCompileResult(cb) {
		ipcRenderer.on("compileResult", (_event, result) => cb(result));
	},
	onFileChanged(cb) {
		ipcRenderer.on("fileChanged", (_event, file) => cb(file));
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
