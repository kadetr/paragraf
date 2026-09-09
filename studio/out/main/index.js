import { n as parseDimension, t as resolvePageSize } from "./chunks/sizes-CsnQI3a3.js";
import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";
import { basename, join, relative, resolve } from "path";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { Worker } from "worker_threads";
import chokidar from "chokidar";
import Store from "electron-store";
import { DOMParser } from "@xmldom/xmldom";
// -- CommonJS Shims --
import __cjs_mod__ from "node:module";
import.meta.filename;
const __dirname = import.meta.dirname;
__cjs_mod__.createRequire(import.meta.url);
//#region src/schema/validate.ts
var COMPILE_KEY_ALLOWLIST = new Set([
	"shaping",
	"selectable",
	"maxPages",
	"onOverflow",
	"opticalMargins",
	"hyphenation"
]);
function isObject(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
/**
* Validate a raw (already-parsed) studio template.json object.
*
* @param raw — the parsed JSON object (type unknown)
* @returns array of ValidationError. Empty → valid.
*/
function validateStudioSchema(raw) {
	const errors = [];
	if (!isObject(raw)) {
		errors.push({
			field: "",
			message: "template.json must be a JSON object"
		});
		return errors;
	}
	if (!isObject(raw["layout"])) errors.push({
		field: "layout",
		message: "Missing required field \"layout\""
	});
	else _validateLayout(raw["layout"], errors);
	if (!isObject(raw["fonts"])) errors.push({
		field: "fonts",
		message: "Missing required field \"fonts\""
	});
	if (!isObject(raw["styles"])) errors.push({
		field: "styles",
		message: "Missing required field \"styles\""
	});
	if (!isObject(raw["frames"])) {
		errors.push({
			field: "frames",
			message: "Missing required field \"frames\""
		});
		return errors;
	}
	if (!isObject(raw["pages"])) {
		errors.push({
			field: "pages",
			message: "Missing required field \"pages\""
		});
		return errors;
	}
	const frames = raw["frames"];
	const styles = isObject(raw["styles"]) ? raw["styles"] : {};
	const pages = raw["pages"];
	for (const [frameName, frame] of Object.entries(frames)) if (!isObject(frame)) errors.push({
		field: `frames.${frameName}`,
		message: "Frame must be an object"
	});
	for (const [styleName, style] of Object.entries(styles)) if (isObject(style) && typeof style["extends"] === "string") {
		if (!(style["extends"] in styles)) errors.push({
			field: `styles.${styleName}.extends`,
			message: `Style "${styleName}" extends undefined style "${style["extends"]}"`
		});
	}
	for (const [pageKey, page] of Object.entries(pages)) {
		if (!isObject(page)) {
			errors.push({
				field: `pages.${pageKey}`,
				message: "Page must be an object"
			});
			continue;
		}
		const pageFrames = page["frames"];
		if (!Array.isArray(pageFrames)) {
			errors.push({
				field: `pages.${pageKey}.frames`,
				message: "Page \"frames\" must be an array"
			});
			continue;
		}
		let autoCount = 0;
		for (let i = 0; i < pageFrames.length; i++) {
			const frameName = pageFrames[i];
			if (typeof frameName !== "string") {
				errors.push({
					field: `pages.${pageKey}.frames[${i}]`,
					message: "Frame reference must be a string"
				});
				continue;
			}
			if (!(frameName in frames)) {
				errors.push({
					field: `pages.${pageKey}.frames[${i}]`,
					message: `Frame "${frameName}" not found in frames registry`
				});
				continue;
			}
			const frameObj = frames[frameName];
			if (isObject(frameObj) && frameObj["height"] === "auto") autoCount++;
		}
		if (autoCount > 1) errors.push({
			field: `pages.${pageKey}`,
			message: `Page "${pageKey}" has ${autoCount} frames with height "auto" — only one is allowed`
		});
	}
	if ("compile" in raw && isObject(raw["compile"])) {
		for (const key of Object.keys(raw["compile"])) if (!COMPILE_KEY_ALLOWLIST.has(key)) errors.push({
			field: `compile.${key}`,
			message: `Unknown compile setting "${key}" — allowed keys: ${[...COMPILE_KEY_ALLOWLIST].join(", ")}`
		});
	}
	return errors;
}
function _validateLayout(layout, errors) {
	if (!layout["size"]) errors.push({
		field: "layout.size",
		message: "Missing required field \"layout.size\""
	});
	if (layout["margins"] === void 0 || layout["margins"] === null) errors.push({
		field: "layout.margins",
		message: "Missing required field \"layout.margins\""
	});
}
//#endregion
//#region src/schema/translate.ts
/**
* Translate a validated StudioTemplate into compile-ready objects.
*
* @param t — a StudioTemplate (already validated via validateStudioSchema)
* @returns TranslationResult — errors[] is non-empty when semantic constraints are violated
*          (e.g. computed auto height ≤ 0).
*/
function translateToTemplate(t) {
	const errors = [];
	const imageFrames = [];
	const [, pageH] = resolvePageSize(t.layout.size);
	const { topMargin, bottomMargin } = _resolveVerticalMargins(t.layout.margins);
	const availableH = pageH - topMargin - bottomMargin;
	const pages = [];
	for (const [pageKey, page] of Object.entries(t.pages)) {
		const range = _resolvePageRange(pageKey);
		let fixedTotal = 0;
		let hasAuto = false;
		for (const frameName of page.frames) {
			const frame = t.frames[frameName];
			if (!frame) continue;
			if (frame.height === "auto") hasAuto = true;
			else fixedTotal += parseDimension(frame.height);
		}
		const autoHeight = availableH - fixedTotal;
		if (hasAuto && autoHeight <= 0) errors.push({
			field: `pages.${pageKey}`,
			message: `Computed auto height for page "${pageKey}" is ${autoHeight.toFixed(2)} pt — must be > 0`
		});
		const regions = [];
		for (let i = 0; i < page.frames.length; i++) {
			const frameName = page.frames[i];
			const frame = t.frames[frameName];
			if (!frame) continue;
			if (frame.type === "image") {
				imageFrames.push({
					name: frameName,
					pageKey,
					frameIndex: i
				});
				continue;
			}
			const region = { height: frame.height === "auto" ? autoHeight : frame.height };
			if (frame.columns !== void 0) region.columns = frame.columns;
			if (frame.gutter !== void 0) region.gutter = frame.gutter;
			if (frame.x !== void 0) region.x = frame.x;
			if (frame.y !== void 0) region.y = frame.y;
			if (frame.width !== void 0) region.width = frame.width;
			regions.push(region);
		}
		pages.push({
			range,
			regions
		});
	}
	let layoutColumns;
	let layoutGutter;
	for (const frame of Object.values(t.frames)) if (frame.type !== "image" && frame.columns && frame.columns > 1) {
		layoutColumns = frame.columns;
		if (frame.gutter !== void 0) layoutGutter = String(frame.gutter);
		break;
	}
	const template = {
		layout: {
			size: t.layout.size,
			margins: t.layout.margins,
			pages,
			...layoutColumns !== void 0 ? { columns: layoutColumns } : {},
			...layoutGutter !== void 0 ? { gutter: layoutGutter } : {}
		},
		fonts: t.fonts,
		styles: t.styles,
		content: []
	};
	const compileOptions = {};
	const studioSettings = {};
	if (t.compile) {
		if (t.compile.shaping !== void 0) compileOptions.shaping = t.compile.shaping === "wasm" ? "wasm" : "fontkit";
		if (t.compile.selectable !== void 0) compileOptions.selectable = t.compile.selectable;
		if (t.compile.maxPages !== void 0) compileOptions.maxPages = t.compile.maxPages;
		if (t.compile.onOverflow !== void 0) compileOptions.onOverflow = t.compile.onOverflow;
		if (t.compile.opticalMargins !== void 0) studioSettings.opticalMargins = t.compile.opticalMargins;
		if (t.compile.hyphenation !== void 0) studioSettings.hyphenation = t.compile.hyphenation;
	}
	return {
		template,
		compileOptions,
		studioSettings,
		imageFrames,
		errors
	};
}
/** Map a studio page key to the TemplatePageSpec range value. */
function _resolvePageRange(pageKey) {
	if (pageKey === "first") return 1;
	if (pageKey === "default") return "default";
	return pageKey;
}
/** Extract top and bottom margin values in points from the studio margins field. */
function _resolveVerticalMargins(margins) {
	if (typeof margins === "object" && !Array.isArray(margins)) {
		const m = margins;
		return {
			topMargin: parseDimension(m.top),
			bottomMargin: parseDimension(m.bottom)
		};
	}
	const v = parseDimension(margins);
	return {
		topMargin: v,
		bottomMargin: v
	};
}
/** Extract left margin value in points from the studio margins field. */
function _resolveLeftMargin(margins) {
	if (typeof margins === "object" && !Array.isArray(margins)) return parseDimension(margins.left);
	return parseDimension(margins);
}
/**
* Compute absolute frame positions (in points, from page top-left) for the
* named page in a StudioTemplate.  Used to drive the FrameOverlay in the
* preview panel.
*
* @param t       — validated StudioTemplate
* @param pageKey — which page to use; falls back to the first defined page
* @returns array of StudioFrameGeometry (empty if the page has no text frames)
*/
function computeFrameGeometry(t, pageKey = "default") {
	const page = t.pages[pageKey] ?? t.pages[Object.keys(t.pages)[0]];
	if (!page) return [];
	const [pageW, pageH] = resolvePageSize(t.layout.size);
	const { topMargin, bottomMargin } = _resolveVerticalMargins(t.layout.margins);
	const leftMargin = _resolveLeftMargin(t.layout.margins);
	const rightMargin = (() => {
		const m = t.layout.margins;
		if (typeof m === "object" && !Array.isArray(m)) return parseDimension(m.right);
		return parseDimension(m);
	})();
	const usableWidth = pageW - leftMargin - rightMargin;
	const availableH = pageH - topMargin - bottomMargin;
	let fixedTotal = 0;
	let hasAuto = false;
	for (const frameName of page.frames) {
		const frame = t.frames[frameName];
		if (!frame || frame.type === "image") continue;
		if (frame.height === "auto") hasAuto = true;
		else fixedTotal += parseDimension(frame.height);
	}
	const autoHeight = hasAuto ? availableH - fixedTotal : 0;
	const result = [];
	let cumulativeY = 0;
	for (const frameName of page.frames) {
		const frame = t.frames[frameName];
		if (!frame || frame.type === "image") continue;
		const fWidth = frame.width !== void 0 ? parseDimension(frame.width) : usableWidth;
		const fHeight = frame.height === "auto" ? autoHeight : parseDimension(frame.height);
		const fX = leftMargin + (frame.x !== void 0 ? parseDimension(frame.x) : 0);
		const fY = frame.y !== void 0 ? topMargin + parseDimension(frame.y) : topMargin + cumulativeY;
		result.push({
			name: frameName,
			x: fX,
			y: fY,
			width: fWidth,
			height: fHeight,
			columnCount: frame.columns ?? 1,
			columnGutter: frame.gutter !== void 0 ? parseDimension(frame.gutter) : 0
		});
		if (frame.y === void 0) cumulativeY += fHeight;
	}
	return result;
}
//#endregion
//#region src/schema/content-parser.ts
/** Check if the document has a <parsererror> anywhere in the tree. */
function hasParseerror(doc) {
	return doc.getElementsByTagName("parsererror").length > 0;
}
/** Extract the text content of the first <parsererror> element. */
function extractParseerrorMessage(doc) {
	const el = doc.getElementsByTagName("parsererror")[0];
	return el ? el.textContent ?? "unknown parse error" : "unknown parse error";
}
/** Get all direct <p> children of a section element. */
function getParagraphs(section) {
	const result = [];
	const children = section.childNodes;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.nodeType === 1 && child.tagName === "p") result.push(child);
	}
	return result;
}
/** Serialize an element back to its XML string representation. */
function serializeElement(el) {
	const attrs = [];
	const attributes = el.attributes;
	for (let i = 0; i < attributes.length; i++) {
		const attr = attributes[i];
		attrs.push(`${attr.name}="${attr.value}"`);
	}
	return `${attrs.length > 0 ? `<${el.tagName} ${attrs.join(" ")}>` : `<${el.tagName}>`}${extractText(el)}</${el.tagName}>`;
}
/**
* Serialize the text content of a <p> element, preserving inline markup
* (e.g. <span style="...">text</span>) but excluding <image> elements.
* Whitespace is normalised: all runs of whitespace (including newlines from
* indented XML) are collapsed to a single space and leading/trailing
* whitespace is trimmed.
*/
function extractText(p) {
	const parts = [];
	const children = p.childNodes;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.nodeType === 3) parts.push(child.nodeValue ?? "");
		else if (child.nodeType === 1) {
			const el = child;
			if (el.tagName === "image") continue;
			parts.push(serializeElement(el));
		}
	}
	return parts.join("").replace(/\s+/g, " ").trim();
}
/**
* Parse a studio content.xml string into StudioContentSlot[].
*
* Sections are ordered ascending by frameIndex (the 0-based position of the
* frame in the active page's `frames[]` array), not by XML document order.
* Multiple <p> elements in one section share the same frameIndex and appear
* consecutively.
*
* @param xml           — content.xml string
* @param studioTemplate — validated StudioTemplate (for frame/style lookups)
* @param pageKey        — which page to resolve frame names against (default: "default")
* @returns ParseContentResult — slots[] and errors[]. If XML is malformed,
*          slots is empty and errors contains the parse error.
*/
function parseContentXml(xml, studioTemplate, pageKey = "default") {
	const errors = [];
	const slots = [];
	const parser = new DOMParser();
	let doc;
	try {
		doc = parser.parseFromString(xml, "text/xml");
	} catch (err) {
		errors.push({
			field: "",
			message: `Malformed XML: ${err instanceof Error ? err.message : String(err)}`
		});
		return {
			slots,
			errors
		};
	}
	const root = doc.documentElement;
	if (root && (root.tagName === "parsererror" || hasParseerror(doc))) {
		errors.push({
			field: "",
			message: `Malformed XML: ${extractParseerrorMessage(doc)}`
		});
		return {
			slots,
			errors
		};
	}
	if (!(studioTemplate.pages[pageKey] ?? studioTemplate.pages[Object.keys(studioTemplate.pages)[0]])) {
		errors.push({
			field: "pageKey",
			message: "No pages defined in template"
		});
		return {
			slots,
			errors
		};
	}
	const allFrameNames = Object.keys(studioTemplate.frames);
	const frameIndexMap = /* @__PURE__ */ new Map();
	for (let i = 0; i < allFrameNames.length; i++) frameIndexMap.set(allFrameNames[i], i);
	const styleNames = new Set(Object.keys(studioTemplate.styles));
	const sectionsByFrame = /* @__PURE__ */ new Map();
	const sections = doc.getElementsByTagName("section");
	for (let s = 0; s < sections.length; s++) {
		const section = sections[s];
		const frameName = section.getAttribute("frame");
		if (!frameName) {
			errors.push({
				field: `section[${s}]`,
				message: `<section> at index ${s} is missing required "frame" attribute`
			});
			continue;
		}
		if (!frameIndexMap.has(frameName)) {
			errors.push({
				field: `section[${s}].frame`,
				message: `Frame "${frameName}" is not defined in the template frames registry`
			});
			continue;
		}
		const frameIndex = frameIndexMap.get(frameName);
		const existing = sectionsByFrame.get(frameIndex);
		const pElements = getParagraphs(section);
		if (existing) existing.paragraphs.push(...pElements);
		else sectionsByFrame.set(frameIndex, {
			frameName,
			paragraphs: pElements
		});
	}
	const sortedFrameIndices = [...sectionsByFrame.keys()].sort((a, b) => a - b);
	for (const frameIndex of sortedFrameIndices) {
		const { frameName, paragraphs } = sectionsByFrame.get(frameIndex);
		for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
			const p = paragraphs[pIdx];
			const style = p.getAttribute("style");
			if (!style) {
				errors.push({
					field: `section[frame="${frameName}"].p[${pIdx}]`,
					message: `<p> at index ${pIdx} in frame "${frameName}" is missing required "style" attribute`
				});
				continue;
			}
			if (!styleNames.has(style)) {
				errors.push({
					field: `section[frame="${frameName}"].p[${pIdx}].style`,
					message: `Style "${style}" not found in template styles registry`
				});
				continue;
			}
			const text = extractText(p);
			slots.push({
				style,
				text,
				frameIndex
			});
		}
	}
	return {
		slots,
		errors
	};
}
//#endregion
//#region electron.main.ts
var store = new Store({ defaults: {
	dividerPositions: [280, 280],
	windowBounds: {
		width: 1440,
		height: 900,
		x: 100,
		y: 100
	}
} });
var mainWindow = null;
function createWindow() {
	mainWindow = new BrowserWindow({
		...store.get("windowBounds"),
		minWidth: 900,
		minHeight: 600,
		title: "Paragraf Studio",
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});
	if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	else mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	mainWindow.on("resize", saveWindowBounds);
	mainWindow.on("move", saveWindowBounds);
	mainWindow.on("closed", () => {
		terminateWorker();
		stopWatcher();
		mainWindow = null;
	});
}
function saveWindowBounds() {
	if (!mainWindow) return;
	const [width, height] = mainWindow.getSize();
	const [x, y] = mainWindow.getPosition();
	store.set("windowBounds", {
		width,
		height,
		x,
		y
	});
}
var compileWorker = null;
function spawnWorker(projectPath) {
	const worker = new Worker(join(__dirname, "../main/compile.worker.js"), { workerData: { projectPath } });
	worker.on("message", async (result) => {
		if (result.type === "pdf") {
			if (!currentProjectPath) return;
			const projectName = basename(currentProjectPath);
			const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
			const outputDir = join(currentProjectPath, "output");
			await mkdir(outputDir, { recursive: true });
			const filePath = join(outputDir, `${projectName}-${ts}.pdf`);
			await writeFile(filePath, result.buffer);
			shell.openPath(filePath);
			mainWindow?.webContents.send("compileResult", {
				type: "pdf",
				filePath
			});
			return;
		}
		mainWindow?.webContents.send("compileResult", result);
	});
	worker.on("error", (err) => {
		console.error("[compile.worker] error:", err);
		mainWindow?.webContents.send("compileResult", {
			type: "compile-error",
			message: err.message
		});
	});
	return worker;
}
function terminateWorker() {
	compileWorker?.terminate();
	compileWorker = null;
}
var watcher = null;
var debounceTimer = null;
var currentProjectPath = null;
/**
* Filenames written by `writeProjectFile` IPC.
* When the watcher fires for one of these, we skip the `fileChanged` event
* to the renderer (the editor is already showing that content and would lose
* its undo history if reinitialised). We still trigger a recompile.
*/
var ownWritePending = /* @__PURE__ */ new Set();
var FILE_MAP = {
	"template.json": "template",
	"content.xml": "content",
	"data/sample.json": "data"
};
function startWatcher(projectPath) {
	stopWatcher();
	currentProjectPath = projectPath;
	const watchTargets = Object.keys(FILE_MAP).map((f) => resolve(projectPath, f));
	watcher = chokidar.watch(watchTargets, {
		ignoreInitial: true,
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 50
		}
	});
	watcher.on("change", (filePath) => {
		const rel = relative(projectPath, filePath);
		const changedFile = FILE_MAP[rel] ?? "template";
		if (ownWritePending.has(rel)) ownWritePending.delete(rel);
		else mainWindow?.webContents.send("fileChanged", changedFile);
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => triggerCompile(projectPath), 300);
	});
}
function stopWatcher() {
	watcher?.close();
	watcher = null;
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
}
async function triggerCompile(projectPath, outputOverride) {
	if (!compileWorker) return;
	try {
		const templateJson = await readFile(resolve(projectPath, "template.json"), "utf-8");
		const raw = JSON.parse(templateJson);
		const schemaErrors = validateStudioSchema(raw);
		if (schemaErrors.length > 0) {
			compileWorker.postMessage({ validationErrors: schemaErrors });
			return;
		}
		const studioTemplate = raw;
		const { template, compileOptions, studioSettings, errors: translationErrors } = translateToTemplate(studioTemplate);
		for (const style of Object.values(template.styles)) {
			if (studioSettings.hyphenation === false) style.hyphenation = false;
			if (studioSettings.opticalMargins === true) style.opticalMarginAlignment = true;
			if (style.emergencyStretch === void 0) style.emergencyStretch = 30;
		}
		try {
			const { slots } = parseContentXml(await readFile(resolve(projectPath, "content.xml"), "utf-8"), studioTemplate);
			template.content = slots;
		} catch {
			template.content = [];
		}
		const fontsKey = JSON.stringify({
			fonts: raw["fonts"] ?? {},
			shaping: compileOptions.shaping ?? "fontkit"
		});
		const frameGeometry = outputOverride !== "pdf" ? computeFrameGeometry(studioTemplate) : void 0;
		const input = {
			template,
			options: {
				...compileOptions,
				output: outputOverride ?? "svg",
				verbose: false,
				...outputOverride === "pdf" ? {} : { selectable: false }
			},
			projectPath,
			fontsKey,
			validationErrors: translationErrors.length > 0 ? translationErrors : void 0,
			frameGeometry
		};
		compileWorker.postMessage(input);
	} catch (err) {
		mainWindow?.webContents.send("compileResult", {
			type: "compile-error",
			message: err instanceof Error ? err.message : String(err)
		});
	}
}
ipcMain.handle("openFolder", async () => {
	const result = await dialog.showOpenDialog({
		properties: ["openDirectory"],
		title: "Open Paragraf Project Folder"
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	const projectPath = result.filePaths[0];
	terminateWorker();
	compileWorker = spawnWorker(projectPath);
	startWatcher(projectPath);
	await triggerCompile(projectPath);
	return projectPath;
});
var DEFAULT_TEMPLATE_JSON = JSON.stringify({
	layout: {
		size: "A4",
		margins: 72
	},
	fonts: {},
	styles: { body: {
		font: {
			family: "System",
			size: 12
		},
		lineHeight: 18,
		alignment: "left"
	} },
	frames: { body: { height: "auto" } },
	pages: { default: { frames: ["body"] } },
	compile: {
		shaping: "js",
		hyphenation: false
	}
}, null, 2);
var DEFAULT_CONTENT_XML = `<content>
  <section frame="body">
    <p style="body">Start writing here.</p>
  </section>
</content>
`;
ipcMain.handle("newProject", async () => {
	const result = await dialog.showOpenDialog({
		properties: ["openDirectory", "createDirectory"],
		title: "Choose Folder for New Project"
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	const projectPath = result.filePaths[0];
	await writeFile(join(projectPath, "template.json"), DEFAULT_TEMPLATE_JSON, "utf-8");
	await writeFile(join(projectPath, "content.xml"), DEFAULT_CONTENT_XML, "utf-8");
	terminateWorker();
	compileWorker = spawnWorker(projectPath);
	startWatcher(projectPath);
	await triggerCompile(projectPath);
	return projectPath;
});
ipcMain.handle("triggerPdfCompile", async () => {
	if (!currentProjectPath) return;
	await triggerCompile(currentProjectPath, "pdf");
});
ipcMain.on("getWorkspaceState", (event) => {
	event.returnValue = {
		dividerPositions: store.get("dividerPositions"),
		windowBounds: store.get("windowBounds")
	};
});
ipcMain.on("setWorkspaceState", (_event, state) => {
	if (state.dividerPositions !== void 0) store.set("dividerPositions", state.dividerPositions);
	if (state.windowBounds !== void 0) store.set("windowBounds", state.windowBounds);
});
ipcMain.handle("readProjectFile", async (_event, filename) => {
	if (!currentProjectPath) return null;
	const resolved = resolve(currentProjectPath, filename);
	if (!resolved.startsWith(currentProjectPath + "/") && resolved !== currentProjectPath) return null;
	try {
		return await readFile(resolved, "utf-8");
	} catch {
		return null;
	}
});
ipcMain.handle("writeProjectFile", async (_event, filename, content) => {
	if (!currentProjectPath) return false;
	const resolved = resolve(currentProjectPath, filename);
	if (!resolved.startsWith(currentProjectPath + "/") && resolved !== currentProjectPath) return false;
	try {
		const tmpPath = resolved + ".tmp";
		await writeFile(tmpPath, content, "utf-8");
		ownWritePending.add(relative(currentProjectPath, resolved));
		await rename(tmpPath, resolved);
		return true;
	} catch {
		return false;
	}
});
ipcMain.handle("setCompileSetting", async (_event, key, value) => {
	if (!currentProjectPath) return;
	const templatePath = join(currentProjectPath, "template.json");
	const tmpPath = templatePath + ".tmp";
	const raw = JSON.parse(await readFile(templatePath, "utf8"));
	if (typeof raw.compile !== "object" || raw.compile === null) raw.compile = {};
	raw.compile[key] = value;
	await writeFile(tmpPath, JSON.stringify(raw, null, 2), "utf8");
	await rename(tmpPath, templatePath);
});
app.whenReady().then(() => {
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
//#endregion
export {};
