import { n as __exportAll } from "../compile.worker.js";
//#region ../0-color/src/profile.ts
function readStr4(bytes, offset) {
	return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}
function readS15Fixed16(view, offset) {
	return view.getInt32(offset) / 65536;
}
function parseXYZTag(view, tagOffset) {
	return {
		x: readS15Fixed16(view, tagOffset + 8),
		y: readS15Fixed16(view, tagOffset + 12),
		z: readS15Fixed16(view, tagOffset + 16)
	};
}
function parseCurvTag(view, tagOffset) {
	const count = view.getUint32(tagOffset + 8);
	if (count === 0) return { kind: "linear" };
	if (count === 1) return {
		kind: "gamma",
		gamma: view.getUint16(tagOffset + 12) / 256
	};
	const values = new Float64Array(count);
	for (let i = 0; i < count; i++) values[i] = view.getUint16(tagOffset + 12 + i * 2) / 65535;
	return {
		kind: "lut",
		values
	};
}
function parseParaTag(view, tagOffset) {
	const fnType = view.getUint16(tagOffset + 8);
	const gamma = readS15Fixed16(view, tagOffset + 12);
	if (fnType === 0) return {
		kind: "gamma",
		gamma
	};
	const extraOffsets = [
		[],
		[16, 20],
		[
			16,
			20,
			24
		],
		[
			16,
			20,
			24,
			28
		],
		[
			16,
			20,
			24,
			28,
			32,
			36
		]
	][fnType] ?? [];
	const params = [gamma];
	for (const off of extraOffsets) params.push(readS15Fixed16(view, tagOffset + off));
	const LUT_SIZE = 1024;
	const values = new Float64Array(LUT_SIZE);
	for (let i = 0; i < LUT_SIZE; i++) values[i] = sampleParametricCurve(fnType, params, i / (LUT_SIZE - 1));
	return {
		kind: "lut",
		values
	};
}
/**
* Evaluate an ICC v4 parametric curve (para tag §10.15) at x ∈ [0, 1].
*
* Types:
*   0: Y = X^g                              params: [g]
*   1: Y = (aX+b)^g if X ≥ -b/a, else 0    params: [g, a, b]
*   2: Y = (aX+b)^g + c if X ≥ -b/a, else c params: [g, a, b, c]
*   3: Y = (aX+b)^g if X ≥ d, else cX       params: [g, a, b, c, d]
*   4: Y = (aX+b)^g+e if X ≥ d, else cX+f   params: [g, a, b, c, d, e, f]
*/
function sampleParametricCurve(fnType, params, x) {
	const g = params[0] ?? 1;
	const a = params[1] ?? 1;
	const b = params[2] ?? 0;
	const c = params[3] ?? 0;
	const d = params[4] ?? 0;
	const e = params[5] ?? 0;
	const f = params[6] ?? 0;
	switch (fnType) {
		case 0: return x <= 0 ? 0 : Math.pow(x, g);
		case 1: return x >= (a !== 0 ? -b / a : 0) ? Math.pow(Math.max(a * x + b, 0), g) : 0;
		case 2: return x >= (a !== 0 ? -b / a : 0) ? Math.pow(Math.max(a * x + b, 0), g) + c : c;
		case 3: return x >= d ? Math.pow(Math.max(a * x + b, 0), g) : c * x;
		case 4: return x >= d ? Math.pow(Math.max(a * x + b, 0), g) + e : c * x + f;
		default: return x <= 0 ? 0 : Math.pow(x, g);
	}
}
function parseMlucTag(bytes, view, tagOffset) {
	if (view.getUint32(tagOffset + 8) === 0) return "";
	const strLengthBytes = view.getUint32(tagOffset + 20);
	const strStart = tagOffset + view.getUint32(tagOffset + 24);
	const charCount = strLengthBytes / 2;
	let name = "";
	for (let i = 0; i < charCount; i++) name += String.fromCodePoint(view.getUint16(strStart + i * 2));
	return name;
}
/** Handles both old-style `desc` (textDescription, sig='desc') and ICC v4 `mluc`. */
function parseDescTag(bytes, view, tagOffset) {
	const sig = readStr4(bytes, tagOffset);
	if (sig === "mluc") return parseMlucTag(bytes, view, tagOffset);
	if (sig === "desc") {
		const asciiLen = view.getUint32(tagOffset + 8);
		let name = "";
		for (let i = 0; i < asciiLen; i++) {
			const ch = bytes[tagOffset + 12 + i];
			if (ch === 0) break;
			name += String.fromCharCode(ch);
		}
		return name;
	}
	return "";
}
function parseMft1Tag(bytes, _view, tagOffset) {
	const inCh = bytes[tagOffset + 8];
	const outCh = bytes[tagOffset + 9];
	const gridPoints = bytes[tagOffset + 10];
	const matrix = [];
	for (let i = 0; i < 9; i++) matrix.push(readS15Fixed16(_view, tagOffset + 12 + i * 4));
	const inputTableEntries = 256;
	const outputTableEntries = 256;
	let dataOffset = tagOffset + 48;
	const inputCurves = [];
	for (let c = 0; c < inCh; c++) {
		const curve = new Float64Array(inputTableEntries);
		for (let i = 0; i < inputTableEntries; i++) {
			curve[i] = bytes[dataOffset] / 255;
			dataOffset += 1;
		}
		inputCurves.push(curve);
	}
	const clutSize = Math.pow(gridPoints, inCh) * outCh;
	const clut = new Float64Array(clutSize);
	for (let i = 0; i < clutSize; i++) {
		clut[i] = bytes[dataOffset] / 255;
		dataOffset += 1;
	}
	const outputCurves = [];
	for (let c = 0; c < outCh; c++) {
		const curve = new Float64Array(outputTableEntries);
		for (let i = 0; i < outputTableEntries; i++) {
			curve[i] = bytes[dataOffset] / 255;
			dataOffset += 1;
		}
		outputCurves.push(curve);
	}
	return {
		inChannels: inCh,
		outChannels: outCh,
		gridPoints,
		matrix,
		inputCurves,
		clut,
		outputCurves
	};
}
function parseMft2Tag(bytes, view, tagOffset) {
	const inCh = bytes[tagOffset + 8];
	const outCh = bytes[tagOffset + 9];
	const gridPoints = bytes[tagOffset + 10];
	const matrix = [];
	for (let i = 0; i < 9; i++) matrix.push(readS15Fixed16(view, tagOffset + 12 + i * 4));
	const inputTableEntries = view.getUint16(tagOffset + 48);
	const outputTableEntries = view.getUint16(tagOffset + 50);
	let dataOffset = tagOffset + 52;
	const inputCurves = [];
	for (let c = 0; c < inCh; c++) {
		const curve = new Float64Array(inputTableEntries);
		for (let i = 0; i < inputTableEntries; i++) {
			curve[i] = view.getUint16(dataOffset) / 65535;
			dataOffset += 2;
		}
		inputCurves.push(curve);
	}
	const clutSize = Math.pow(gridPoints, inCh) * outCh;
	const clut = new Float64Array(clutSize);
	for (let i = 0; i < clutSize; i++) {
		clut[i] = view.getUint16(dataOffset) / 65535;
		dataOffset += 2;
	}
	const outputCurves = [];
	for (let c = 0; c < outCh; c++) {
		const curve = new Float64Array(outputTableEntries);
		for (let i = 0; i < outputTableEntries; i++) {
			curve[i] = view.getUint16(dataOffset) / 65535;
			dataOffset += 2;
		}
		outputCurves.push(curve);
	}
	return {
		inChannels: inCh,
		outChannels: outCh,
		gridPoints,
		matrix,
		inputCurves,
		clut,
		outputCurves
	};
}
function sigToColorSpace(sig) {
	const s = sig.trim();
	if (s === "RGB") return "RGB";
	if (s === "CMYK") return "CMYK";
	if (s === "Lab") return "Lab";
	if (s === "GRAY" || s === "Gray") return "Gray";
	return "RGB";
}
function sigToPcs(sig) {
	return sig.trim().startsWith("Lab") ? "Lab" : "XYZ";
}
/**
* Parse a raw ICC v2 or v4 profile from bytes.
* Throws on malformed or unrecognised input.
*/
function parseIccProfile(bytes) {
	if (bytes.byteLength < 128) throw new Error("ICC profile too short (< 128 bytes)");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const magic = readStr4(bytes, 36);
	if (magic !== "acsp") throw new Error(`Invalid ICC signature: expected 'acsp', got '${magic}'`);
	const colorSpaceSig = readStr4(bytes, 16);
	const pcsSig = readStr4(bytes, 20);
	const renderingIntent = view.getUint32(64);
	const whitePoint = {
		x: readS15Fixed16(view, 68),
		y: readS15Fixed16(view, 72),
		z: readS15Fixed16(view, 76)
	};
	const tagCount = view.getUint32(128);
	const tags = /* @__PURE__ */ new Map();
	for (let i = 0; i < tagCount; i++) {
		const base = 132 + i * 12;
		const sig = readStr4(bytes, base);
		const offset = view.getUint32(base + 4);
		const size = view.getUint32(base + 8);
		tags.set(sig, {
			offset,
			size
		});
	}
	let name = "";
	const descEntry = tags.get("desc");
	if (descEntry) name = parseDescTag(bytes, view, descEntry.offset);
	let matrix;
	const rXYZEntry = tags.get("rXYZ");
	const gXYZEntry = tags.get("gXYZ");
	const bXYZEntry = tags.get("bXYZ");
	if (rXYZEntry && gXYZEntry && bXYZEntry) matrix = {
		r: parseXYZTag(view, rXYZEntry.offset),
		g: parseXYZTag(view, gXYZEntry.offset),
		b: parseXYZTag(view, bXYZEntry.offset)
	};
	let trc;
	const rTRCEntry = tags.get("rTRC");
	const gTRCEntry = tags.get("gTRC");
	const bTRCEntry = tags.get("bTRC");
	if (rTRCEntry && gTRCEntry && bTRCEntry) {
		function parseTRC(entry) {
			const sig = readStr4(bytes, entry.offset);
			if (sig === "curv") return parseCurvTag(view, entry.offset);
			if (sig === "para") return parseParaTag(view, entry.offset);
			return { kind: "linear" };
		}
		trc = [
			parseTRC(rTRCEntry),
			parseTRC(gTRCEntry),
			parseTRC(bTRCEntry)
		];
	}
	function parseLutEntry(entry) {
		const sig = readStr4(bytes, entry.offset);
		if (sig === "mft2") return parseMft2Tag(bytes, view, entry.offset);
		if (sig === "mft1") return parseMft1Tag(bytes, view, entry.offset);
	}
	let a2b0;
	let b2a0;
	let b2a1;
	let b2a2;
	const a2b0Entry = tags.get("A2B0");
	const b2a0Entry = tags.get("B2A0");
	const b2a1Entry = tags.get("B2A1");
	const b2a2Entry = tags.get("B2A2");
	if (a2b0Entry) a2b0 = parseLutEntry(a2b0Entry);
	if (b2a0Entry) b2a0 = parseLutEntry(b2a0Entry);
	if (b2a1Entry) b2a1 = parseLutEntry(b2a1Entry);
	if (b2a2Entry) b2a2 = parseLutEntry(b2a2Entry);
	return {
		name,
		colorSpace: sigToColorSpace(colorSpaceSig),
		pcs: sigToPcs(pcsSig),
		renderingIntent,
		whitePoint,
		matrix,
		trc,
		a2b0,
		b2a0,
		b2a1,
		b2a2,
		bytes
	};
}
//#endregion
//#region ../0-color/src/srgb.ts
var SRGB_RX = .4361, SRGB_RY = .2225, SRGB_RZ = .0139;
var SRGB_GX = .3851, SRGB_GY = .7169, SRGB_GZ = .0971;
var SRGB_BX = .1431, SRGB_BY = .0606, SRGB_BZ = .7141;
var D50_X = .9642, D50_Y = 1, D50_Z = .8249;
var SRGB_GAMMA = 2.2;
var SRGB_NAME = "sRGB IEC61966-2.1";
var DATA_START = 228;
var DESC_SIZE = 64;
var XYZ_SIZE = 20;
var TRC_SIZE = 16;
var TOTAL_SIZE = DATA_START + DESC_SIZE + XYZ_SIZE * 4 + TRC_SIZE * 3;
function writeStr(u8, offset, s) {
	for (let i = 0; i < s.length; i++) u8[offset + i] = s.charCodeAt(i);
}
function toS15Fixed16(v) {
	return Math.round(v * 65536);
}
function writeXYZTag(view, u8, offset, x, y, z) {
	writeStr(u8, offset, "XYZ ");
	view.setUint32(offset + 4, 0);
	view.setInt32(offset + 8, toS15Fixed16(x));
	view.setInt32(offset + 12, toS15Fixed16(y));
	view.setInt32(offset + 16, toS15Fixed16(z));
}
function writeCurvGammaTag(view, u8, offset, gamma) {
	writeStr(u8, offset, "curv");
	view.setUint32(offset + 4, 0);
	view.setUint32(offset + 8, 1);
	view.setUint16(offset + 12, Math.round(gamma * 256));
}
/**
* Synthesize a minimal valid ICC v4 sRGB profile in memory.
* Contains: header, desc (mluc), wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC.
* Uses gamma 2.2 TRC and D50-adapted sRGB primaries from the ICC specification.
* No disk I/O — safe to call in any environment.
*/
function buildSrgbProfileBytes() {
	const buf = new ArrayBuffer(TOTAL_SIZE);
	const view = new DataView(buf);
	const u8 = new Uint8Array(buf);
	view.setUint32(0, TOTAL_SIZE);
	view.setUint32(8, 67108864);
	writeStr(u8, 12, "mntr");
	writeStr(u8, 16, "RGB ");
	writeStr(u8, 20, "XYZ ");
	writeStr(u8, 36, "acsp");
	view.setUint32(64, 0);
	view.setInt32(68, toS15Fixed16(D50_X));
	view.setInt32(72, toS15Fixed16(D50_Y));
	view.setInt32(76, toS15Fixed16(D50_Z));
	view.setUint32(128, 8);
	const descOffset = DATA_START;
	const wtptOffset = descOffset + DESC_SIZE;
	const rXYZOffset = wtptOffset + XYZ_SIZE;
	const gXYZOffset = rXYZOffset + XYZ_SIZE;
	const bXYZOffset = gXYZOffset + XYZ_SIZE;
	const rTRCOffset = bXYZOffset + XYZ_SIZE;
	const gTRCOffset = rTRCOffset + TRC_SIZE;
	const bTRCOffset = gTRCOffset + TRC_SIZE;
	const tagTable = [
		[
			"desc",
			descOffset,
			DESC_SIZE
		],
		[
			"wtpt",
			wtptOffset,
			XYZ_SIZE
		],
		[
			"rXYZ",
			rXYZOffset,
			XYZ_SIZE
		],
		[
			"gXYZ",
			gXYZOffset,
			XYZ_SIZE
		],
		[
			"bXYZ",
			bXYZOffset,
			XYZ_SIZE
		],
		[
			"rTRC",
			rTRCOffset,
			TRC_SIZE
		],
		[
			"gTRC",
			gTRCOffset,
			TRC_SIZE
		],
		[
			"bTRC",
			bTRCOffset,
			TRC_SIZE
		]
	];
	let tablePos = 132;
	for (const [sig, off, size] of tagTable) {
		writeStr(u8, tablePos, sig);
		view.setUint32(tablePos + 4, off);
		view.setUint32(tablePos + 8, size);
		tablePos += 12;
	}
	{
		const name = SRGB_NAME;
		const nameUtf16Len = 34;
		let p = descOffset;
		writeStr(u8, p, "mluc");
		p += 4;
		view.setUint32(p, 0);
		p += 4;
		view.setUint32(p, 1);
		p += 4;
		view.setUint32(p, 12);
		p += 4;
		writeStr(u8, p, "en");
		p += 2;
		writeStr(u8, p, "US");
		p += 2;
		view.setUint32(p, nameUtf16Len);
		p += 4;
		view.setUint32(p, 28);
		p += 4;
		for (let i = 0; i < 17; i++) {
			view.setUint16(p, name.charCodeAt(i));
			p += 2;
		}
	}
	writeXYZTag(view, u8, wtptOffset, D50_X, D50_Y, D50_Z);
	writeXYZTag(view, u8, rXYZOffset, SRGB_RX, SRGB_RY, SRGB_RZ);
	writeXYZTag(view, u8, gXYZOffset, SRGB_GX, SRGB_GY, SRGB_GZ);
	writeXYZTag(view, u8, bXYZOffset, SRGB_BX, SRGB_BY, SRGB_BZ);
	writeCurvGammaTag(view, u8, rTRCOffset, SRGB_GAMMA);
	writeCurvGammaTag(view, u8, gTRCOffset, SRGB_GAMMA);
	writeCurvGammaTag(view, u8, bTRCOffset, SRGB_GAMMA);
	return u8;
}
/**
* Build and parse the built-in sRGB profile entirely in memory.
* The returned `ColorProfile.bytes` contains the raw ICC bytes for PDF embedding.
*/
function loadBuiltinSrgb() {
	return parseIccProfile(buildSrgbProfileBytes());
}
//#endregion
//#region ../0-color/src/lut.ts
/**
* Evaluate a normalized 1D curve at position t ∈ [0, 1].
* The curve has `n` entries uniformly spaced over [0, 1].
* Linear interpolation between neighbouring entries.
*/
function eval1DCurve(curve, t) {
	if (t <= 0) return curve[0];
	if (t >= 1) return curve[curve.length - 1];
	const n = curve.length;
	const f = t * (n - 1);
	const i = Math.floor(f);
	const frac = f - i;
	if (i >= n - 1) return curve[n - 1];
	return curve[i] * (1 - frac) + curve[i + 1] * frac;
}
/**
* Evaluate an n-dimensional lookup table at `input` using tetrahedral
* interpolation (per ICC specification §10.8 / Argyll CMS reference).
*
* @param clut       Flattened CLUT values in [0, 1].
*                   Indexed: channel-0 outermost (slowest), channel-(inCh-1) innermost.
*                   Flat index = (i[0]*g^(n-1) + … + i[n-1]) * outCh + outCh.
* @param inCh       Number of input channels (must be 3 for tetrahedral path).
* @param outCh      Number of output channels.
* @param gridPoints Grid points per axis.
* @param input      Input values, each in [0, 1].
*/
function evalClutTetrahedral(clut, inCh, outCh, gridPoints, input) {
	if (inCh !== 3) return evalClutTrilinear(clut, inCh, outCh, gridPoints, input);
	const g = gridPoints;
	const gm1 = g - 1;
	const ax = Math.min(input[0], 1) * gm1;
	const ay = Math.min(input[1], 1) * gm1;
	const az = Math.min(input[2], 1) * gm1;
	const ix = Math.min(Math.floor(ax), gm1 - 1);
	const iy = Math.min(Math.floor(ay), gm1 - 1);
	const iz = Math.min(Math.floor(az), gm1 - 1);
	const fx = ax - ix;
	const fy = ay - iy;
	const fz = az - iz;
	const stride0 = g * g * outCh;
	const stride1 = g * outCh;
	const stride2 = outCh;
	const base = ix * stride0 + iy * stride1 + iz * stride2;
	function corner(d0, d1, d2) {
		const off = base + d0 * stride0 + d1 * stride1 + d2 * stride2;
		return clut.subarray(off, off + outCh);
	}
	let w0, w1, w2, w3;
	let v1, v2;
	if (fx >= fy && fy >= fz) {
		w0 = 1 - fx;
		w1 = fx - fy;
		w2 = fy - fz;
		w3 = fz;
		v1 = corner(1, 0, 0);
		v2 = corner(1, 1, 0);
	} else if (fx >= fz && fz >= fy) {
		w0 = 1 - fx;
		w1 = fx - fz;
		w2 = fz - fy;
		w3 = fy;
		v1 = corner(1, 0, 0);
		v2 = corner(1, 0, 1);
	} else if (fy >= fx && fx >= fz) {
		w0 = 1 - fy;
		w1 = fy - fx;
		w2 = fx - fz;
		w3 = fz;
		v1 = corner(0, 1, 0);
		v2 = corner(1, 1, 0);
	} else if (fy >= fz && fz >= fx) {
		w0 = 1 - fy;
		w1 = fy - fz;
		w2 = fz - fx;
		w3 = fx;
		v1 = corner(0, 1, 0);
		v2 = corner(0, 1, 1);
	} else if (fz >= fx && fx >= fy) {
		w0 = 1 - fz;
		w1 = fz - fx;
		w2 = fx - fy;
		w3 = fy;
		v1 = corner(0, 0, 1);
		v2 = corner(1, 0, 1);
	} else {
		w0 = 1 - fz;
		w1 = fz - fy;
		w2 = fy - fx;
		w3 = fx;
		v1 = corner(0, 0, 1);
		v2 = corner(0, 1, 1);
	}
	const v0 = corner(0, 0, 0);
	const v3 = corner(1, 1, 1);
	const out = new Array(outCh);
	for (let c = 0; c < outCh; c++) out[c] = w0 * v0[c] + w1 * v1[c] + w2 * v2[c] + w3 * v3[c];
	return out;
}
function evalClutTrilinear(clut, inCh, outCh, gridPoints, input) {
	const g = gridPoints;
	const gm1 = g - 1;
	function lerp1D(ch, coords) {
		if (ch === inCh) {
			let idx = 0;
			for (let c = 0; c < inCh; c++) idx = idx * g + coords[c];
			const base = idx * outCh;
			return Array.from(clut.subarray(base, base + outCh));
		}
		const f = Math.min(Math.max(input[ch], 0), 1) * gm1;
		const i0 = Math.min(Math.floor(f), gm1 - 1);
		const i1 = i0 + 1;
		const frac = f - i0;
		const lo = lerp1D(ch + 1, [...coords, i0]);
		const hi = lerp1D(ch + 1, [...coords, i1]);
		return lo.map((v, i) => v * (1 - frac) + hi[i] * frac);
	}
	return lerp1D(0, []);
}
/**
* Evaluate a parsed mft2 LUT tag for the given input channels.
*
* Pipeline: [matrix ×] → input curves → CLUT (tetrahedral) → output curves
*
* All values in [0, 1].
*/
function evalLutMft2(tag, input) {
	let vals = [...input];
	if (tag.inChannels === 3) {
		const m = tag.matrix;
		const [x, y, z] = vals;
		vals = [
			m[0] * x + m[1] * y + m[2] * z,
			m[3] * x + m[4] * y + m[5] * z,
			m[6] * x + m[7] * y + m[8] * z
		];
	}
	vals = vals.map((v, c) => eval1DCurve(tag.inputCurves[c], Math.min(Math.max(v, 0), 1)));
	vals = evalClutTetrahedral(tag.clut, tag.inChannels, tag.outChannels, tag.gridPoints, vals);
	vals = vals.map((v, c) => eval1DCurve(tag.outputCurves[c], Math.min(Math.max(v, 0), 1)));
	return vals;
}
//#endregion
//#region ../0-color/src/transform.ts
/** Apply a tone reproduction curve in the forward (device → linear) direction. */
function applyTrcForward(trc, v) {
	if (trc.kind === "linear") return v;
	if (trc.kind === "gamma") {
		if (v <= 0) return 0;
		return Math.pow(v, trc.gamma);
	}
	return eval1DCurve(trc.values, Math.min(Math.max(v, 0), 1));
}
/** Apply a tone reproduction curve in the inverse (linear → device) direction. */
function applyTrcInverse(trc, v) {
	if (trc.kind === "linear") return Math.min(Math.max(v, 0), 1);
	if (trc.kind === "gamma") {
		if (v <= 0) return 0;
		if (v >= 1) return 1;
		return Math.pow(v, 1 / trc.gamma);
	}
	const { values } = trc;
	const n = values.length;
	const vClamped = Math.min(Math.max(v, values[0]), values[n - 1]);
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 32; i++) {
		const mid = (lo + hi) / 2;
		if (eval1DCurve(values, mid) < vClamped) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}
/**
* Invert the 3×3 ICC primary matrix.
* The ICC matrix is stored as column vectors: M * [R,G,B]^T = [X,Y,Z]^T.
* Returns M^-1 such that M^-1 * [X,Y,Z]^T = [R_lin, G_lin, B_lin]^T.
*/
function invertMatrix(m) {
	const { r, g, b } = m;
	const det = r.x * (g.y * b.z - b.y * g.z) - g.x * (r.y * b.z - b.y * r.z) + b.x * (r.y * g.z - g.y * r.z);
	if (Math.abs(det) < 1e-12) throw new Error("ICC matrix is singular — cannot invert");
	const d = 1 / det;
	return {
		r: {
			x: d * (g.y * b.z - b.y * g.z),
			y: -d * (r.y * b.z - b.y * r.z),
			z: d * (r.y * g.z - g.y * r.z)
		},
		g: {
			x: -d * (g.x * b.z - b.x * g.z),
			y: d * (r.x * b.z - b.x * r.z),
			z: -d * (r.x * g.z - g.x * r.z)
		},
		b: {
			x: d * (g.x * b.y - b.x * g.y),
			y: -d * (r.x * b.y - b.x * r.y),
			z: d * (r.x * g.y - g.x * r.y)
		}
	};
}
function labF(t) {
	const delta = 6 / 29;
	return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}
/**
* Convert CIEXYZ (D50-adapted) to ICC-normalized Lab [0, 1].
* L/100, (a+128)/255, (b+128)/255 — the convention used as mft2 B2A0 input.
*/
function xyzToIccLab(xyz, wp) {
	const fx = labF(xyz[0] / wp.x);
	const fy = labF(xyz[1] / wp.y);
	const fz = labF(xyz[2] / wp.z);
	const L = 116 * fy - 16;
	const a = 500 * (fx - fy);
	const b = 200 * (fy - fz);
	return [
		L / 100,
		(a + 128) / 255,
		(b + 128) / 255
	];
}
var MatrixTrcTransform = class {
	constructor(profile) {
		this.profile = profile;
	}
	apply(input) {
		const { matrix, trc } = this.profile;
		if (!matrix || !trc) throw new Error("MatrixTrcTransform requires matrix + TRC profile");
		const rLin = applyTrcForward(trc[0], input[0]);
		const gLin = applyTrcForward(trc[1], input[1]);
		const bLin = applyTrcForward(trc[2], input[2]);
		return [
			matrix.r.x * rLin + matrix.g.x * gLin + matrix.b.x * bLin,
			matrix.r.y * rLin + matrix.g.y * gLin + matrix.b.y * bLin,
			matrix.r.z * rLin + matrix.g.z * gLin + matrix.b.z * bLin
		];
	}
};
/** Inverse direction: XYZ (PCS) → destination device RGB. */
var MatrixTrcInverseTransform = class {
	invMatrix;
	constructor(profile) {
		this.profile = profile;
		if (!profile.matrix || !profile.trc) throw new Error("MatrixTrcInverseTransform requires matrix + TRC profile");
		this.invMatrix = invertMatrix(profile.matrix);
	}
	apply(xyz) {
		const { invMatrix, profile } = this;
		const X = xyz[0] ?? 0;
		const Y = xyz[1] ?? 0;
		const Z = xyz[2] ?? 0;
		const rLin = invMatrix.r.x * X + invMatrix.g.x * Y + invMatrix.b.x * Z;
		const gLin = invMatrix.r.y * X + invMatrix.g.y * Y + invMatrix.b.y * Z;
		const bLin = invMatrix.r.z * X + invMatrix.g.z * Y + invMatrix.b.z * Z;
		const trc = profile.trc;
		return [
			applyTrcInverse(trc[0], Math.min(Math.max(rLin, 0), 1)),
			applyTrcInverse(trc[1], Math.min(Math.max(gLin, 0), 1)),
			applyTrcInverse(trc[2], Math.min(Math.max(bLin, 0), 1))
		];
	}
};
var LutTransform = class {
	constructor(profile, lutKey) {
		this.profile = profile;
		this.lutKey = lutKey;
	}
	apply(input) {
		const tag = this.profile[this.lutKey];
		if (!tag) throw new Error(`LutTransform: ${this.lutKey} tag not present on profile`);
		return evalLutMft2(tag, input);
	}
};
var XyzToLabTransform = class {
	constructor(whitePoint) {
		this.whitePoint = whitePoint;
	}
	apply(input) {
		return xyzToIccLab(input, this.whitePoint);
	}
};
var ChainedTransform = class {
	constructor(steps) {
		this.steps = steps;
	}
	apply(input) {
		return this.steps.reduce((v, t) => t.apply(v), input);
	}
};
var D50 = {
	x: .9642,
	y: 1,
	z: .8249
};
/**
* Build a 3×3 Bradford chromatic adaptation matrix (row-major flat array)
* that converts XYZ from `srcWP` to `dstWP`.
*/
function buildBradfordCat(srcWP, dstWP) {
	const Mb = [
		.8951,
		.2664,
		-.1614,
		-.7502,
		1.7135,
		.0367,
		.0389,
		-.0685,
		1.0296
	];
	const MbInv = [
		.9869929,
		-.1470543,
		.1599627,
		.4323053,
		.5183603,
		.0492912,
		-.0085287,
		.0400428,
		.9684867
	];
	const sR = Mb[0] * srcWP.x + Mb[1] * srcWP.y + Mb[2] * srcWP.z;
	const sG = Mb[3] * srcWP.x + Mb[4] * srcWP.y + Mb[5] * srcWP.z;
	const sB = Mb[6] * srcWP.x + Mb[7] * srcWP.y + Mb[8] * srcWP.z;
	const dR = Mb[0] * dstWP.x + Mb[1] * dstWP.y + Mb[2] * dstWP.z;
	const dG = Mb[3] * dstWP.x + Mb[4] * dstWP.y + Mb[5] * dstWP.z;
	const dB = Mb[6] * dstWP.x + Mb[7] * dstWP.y + Mb[8] * dstWP.z;
	const sr = sR !== 0 ? dR / sR : 1;
	const sg = sG !== 0 ? dG / sG : 1;
	const sb = sB !== 0 ? dB / sB : 1;
	const scaled = [
		sr * Mb[0],
		sr * Mb[1],
		sr * Mb[2],
		sg * Mb[3],
		sg * Mb[4],
		sg * Mb[5],
		sb * Mb[6],
		sb * Mb[7],
		sb * Mb[8]
	];
	const cat = new Array(9);
	for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cat[r * 3 + c] = MbInv[r * 3 + 0] * scaled[0 + c] + MbInv[r * 3 + 1] * scaled[3 + c] + MbInv[r * 3 + 2] * scaled[6 + c];
	return cat;
}
/** True when two white points are close enough that adaptation is a no-op. */
function whitePointsMatch(a, b, tol = 1e-4) {
	return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.z - b.z) < tol;
}
var BradfordAdaptTransform = class {
	cat;
	constructor(srcWP, dstWP) {
		this.cat = buildBradfordCat(srcWP, dstWP);
	}
	apply(xyz) {
		const [X, Y, Z] = xyz;
		const m = this.cat;
		return [
			m[0] * X + m[1] * Y + m[2] * Z,
			m[3] * X + m[4] * Y + m[5] * Z,
			m[6] * X + m[7] * Y + m[8] * Z
		];
	}
};
/**
* Return the best available B2A LUT key for the given rendering intent.
* Falls back to `b2a0` (perceptual) when the intent-specific LUT is absent.
*/
function b2aKeyForIntent(intent, dest) {
	if (intent === "relative" || intent === "absolute") return dest.b2a1 ? "b2a1" : "b2a0";
	if (intent === "saturation") return dest.b2a2 ? "b2a2" : "b2a0";
	return "b2a0";
}
/**
* Create an optimised color transform from `source` profile to `dest` profile.
*
* Supported paths:
* - RGB matrix → RGB matrix: source MatrixTrc → dest inverse MatrixTrc (full device round-trip)
* - RGB matrix → LUT destination (e.g. CMYK): MatrixTrc [→ Bradford] [→ XYZ→Lab] → B2Ax LUT
* - LUT-only source → LUT destination: A2B0 → B2Ax LUT
*
* All output values are normalized to [0, 1] in the destination device colorspace.
*/
function createTransform(source, dest, intent = "perceptual") {
	const hasSourceMatrix = !!(source.matrix && source.trc);
	const hasDestLut = !!dest.b2a0;
	if (hasSourceMatrix && !hasDestLut) {
		const forwardStep = new MatrixTrcTransform(source);
		if (dest.matrix && dest.trc) return new ChainedTransform([forwardStep, new MatrixTrcInverseTransform(dest)]);
		return forwardStep;
	}
	if (hasSourceMatrix && hasDestLut) {
		const steps = [new MatrixTrcTransform(source)];
		const srcWP = source.whitePoint ?? D50;
		if (!whitePointsMatch(srcWP, D50)) steps.push(new BradfordAdaptTransform(srcWP, D50));
		if (dest.pcs === "Lab") steps.push(new XyzToLabTransform(D50));
		steps.push(new LutTransform(dest, b2aKeyForIntent(intent, dest)));
		return new ChainedTransform(steps);
	}
	if (!hasSourceMatrix && hasDestLut) return new ChainedTransform([new LutTransform(source, "a2b0"), new LutTransform(dest, b2aKeyForIntent(intent, dest))]);
	return { apply: (v) => [...v] };
}
//#endregion
//#region ../0-color/src/index.ts
var src_exports = /* @__PURE__ */ __exportAll({
	createTransform: () => createTransform,
	loadBuiltinSrgb: () => loadBuiltinSrgb
});
//#endregion
export { createTransform as n, src_exports as t };
