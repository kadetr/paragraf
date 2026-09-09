import { n as createTransform } from "./src-aJS0V9Kg.js";
import { createRequire } from "module";
// -- CommonJS Shims --
import __cjs_mod__ from "node:module";
import.meta.filename;
import.meta.dirname;
__cjs_mod__.createRequire(import.meta.url);
//#region ../2c-color-wasm/src/wasm-loader.ts
var _require = createRequire(import.meta.url);
/**
* Load the compiled Rust/WASM color transform module synchronously.
* Throws if the WASM package is not present (i.e. wasm-pack has not been run).
* The returned object is the raw wasm-bindgen JS module.
*
* Call once before constructing `WasmColorTransform` or using `createWasmTransform`.
*/
function loadColorWasm() {
	return _require("../wasm/pkg/color_wasm.js");
}
//#endregion
//#region ../2c-color-wasm/src/transform.ts
var D50 = {
	x: .9642,
	y: 1,
	z: .8249
};
function toTrcStep(trc) {
	if (trc.kind === "linear") return { kind: "linear" };
	if (trc.kind === "gamma") return {
		kind: "gamma",
		gamma: trc.gamma
	};
	return {
		kind: "lut",
		values: trc.values
	};
}
/** True when two white points are within tolerance — no Bradford needed. */
function whitePointsMatch(a, b, tol = 1e-4) {
	return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.z - b.z) < tol;
}
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
function buildMatArray(profile) {
	const { r, g, b } = profile.matrix;
	return new Float64Array([
		r.x,
		g.x,
		b.x,
		r.y,
		g.y,
		b.y,
		r.z,
		g.z,
		b.z
	]);
}
/**
* WASM-accelerated color transform. Implements the same `ColorTransform`
* interface as `createTransform` from `@paragraf/color`. Drop-in replacement
* for the matrix-TRC and matrix-TRC-LUT paths.
*
* For unsupported profile combinations (e.g. CMYK source with A2B0 LUT),
* the instance delegates to the pure-TS `createTransform` automatically.
*/
var WasmColorTransform = class {
	constructor(wasm, plan) {
		this.wasm = wasm;
		this.plan = plan;
	}
	apply(input) {
		const { plan, wasm } = this;
		if (plan.path === "fallback") return plan.delegate.apply(input);
		const applyTrc = (trc, v) => {
			const clamped = Math.min(Math.max(v, 0), 1);
			if (trc.kind === "linear") return clamped;
			if (trc.kind === "gamma") return wasm.apply_gamma_trc(trc.gamma, clamped);
			return wasm.eval_trc_lut(trc.values, clamped);
		};
		const [t0, t1, t2] = plan.trc;
		const r = applyTrc(t0, input[0]);
		const g = applyTrc(t1, input[1]);
		const b = applyTrc(t2, input[2]);
		const xyz = wasm.apply_matrix_gamma_trc(1, 1, 1, plan.mat, r, g, b);
		if (plan.path === "matrix-trc") {
			if (plan.destInvMat && plan.destTrc) {
				const inv = plan.destInvMat;
				const X = xyz[0] ?? 0;
				const Y = xyz[1] ?? 0;
				const Z = xyz[2] ?? 0;
				const rLin = Math.min(Math.max(inv[0] * X + inv[1] * Y + inv[2] * Z, 0), 1);
				const gLin = Math.min(Math.max(inv[3] * X + inv[4] * Y + inv[5] * Z, 0), 1);
				const bLin = Math.min(Math.max(inv[6] * X + inv[7] * Y + inv[8] * Z, 0), 1);
				const applyTrcInv = (trc, v) => {
					if (trc.kind === "linear") return v;
					if (trc.kind === "gamma") return wasm.apply_trc_gamma_inverse(trc.gamma, v);
					return wasm.apply_trc_lut_inverse(trc.values, v);
				};
				const [dt0, dt1, dt2] = plan.destTrc;
				return [
					applyTrcInv(dt0, rLin),
					applyTrcInv(dt1, gLin),
					applyTrcInv(dt2, bLin)
				];
			}
			return [
				xyz[0],
				xyz[1],
				xyz[2]
			];
		}
		let ax = xyz[0] ?? 0, ay = xyz[1] ?? 0, az = xyz[2] ?? 0;
		if (plan.bradfordCat) {
			const cat = plan.bradfordCat;
			const tx = cat[0] * ax + cat[1] * ay + cat[2] * az;
			const ty = cat[3] * ax + cat[4] * ay + cat[5] * az;
			const tz = cat[6] * ax + cat[7] * ay + cat[8] * az;
			ax = tx;
			ay = ty;
			az = tz;
		}
		const [wp_x, wp_y, wp_z] = plan.wp;
		const lab = wasm.xyz_to_icc_lab(ax, ay, az, wp_x, wp_y, wp_z);
		const out = wasm.eval_clut_tetrahedral(plan.clut, plan.gridPoints, plan.outCh, lab[0], lab[1], lab[2]);
		return Array.from(out);
	}
};
/**
* Create a `WasmColorTransform` from `source` to `dest` profile.
*
* Accelerated paths:
* - RGB matrix → RGB matrix: matrix-TRC (WASM)
* - RGB matrix → CMYK/LUT:   matrix-TRC + XYZ→Lab + CLUT (WASM)
*
* Unsupported paths (e.g. CMYK source) fall back to the pure-TS
* `createTransform` from `@paragraf/color` automatically.
*
* @param wasm   The wasm module returned by `loadColorWasm()`.
* @param source Source ICC profile.
* @param dest   Destination ICC profile.
* @param intent Rendering intent (default: `'perceptual'`).
*/
function createWasmTransform(wasm, source, dest, intent = "perceptual") {
	const w = wasm;
	const hasSourceMatrix = !!(source.matrix && source.trc);
	const hasDestLut = !!dest.b2a0;
	if (hasSourceMatrix && !hasDestLut) {
		const trc = source.trc;
		const plan = {
			path: "matrix-trc",
			trc: [
				toTrcStep(trc[0]),
				toTrcStep(trc[1]),
				toTrcStep(trc[2])
			],
			mat: buildMatArray(source)
		};
		if (dest.matrix && dest.trc) {
			plan.destInvMat = w.invert_matrix_3x3(buildMatArray(dest));
			plan.destTrc = [
				toTrcStep(dest.trc[0]),
				toTrcStep(dest.trc[1]),
				toTrcStep(dest.trc[2])
			];
		}
		return new WasmColorTransform(w, plan);
	}
	if (hasSourceMatrix && hasDestLut) {
		const trc = source.trc;
		const srcWP = source.whitePoint ?? D50;
		const b2aTag = intent === "relative" || intent === "absolute" ? dest.b2a1 ?? dest.b2a0 : intent === "saturation" ? dest.b2a2 ?? dest.b2a0 : dest.b2a0;
		const bradfordCat = !whitePointsMatch(srcWP, D50) ? new Float64Array(buildBradfordCat(srcWP, D50)) : void 0;
		return new WasmColorTransform(w, {
			path: "matrix-trc-lut",
			trc: [
				toTrcStep(trc[0]),
				toTrcStep(trc[1]),
				toTrcStep(trc[2])
			],
			mat: buildMatArray(source),
			wp: [
				D50.x,
				D50.y,
				D50.z
			],
			bradfordCat,
			clut: new Float64Array(b2aTag.clut),
			gridPoints: b2aTag.gridPoints,
			outCh: b2aTag.outChannels
		});
	}
	return new WasmColorTransform(w, {
		path: "fallback",
		delegate: createTransform(source, dest, intent)
	});
}
//#endregion
export { createWasmTransform, loadColorWasm };
