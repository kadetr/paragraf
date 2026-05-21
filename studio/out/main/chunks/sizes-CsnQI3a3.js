//#region ../1c-layout/src/units.ts
var PT_PER_MM = 72 / 25.4;
var PT_PER_CM = 72 / 2.54;
var PT_PER_INCH = 72;
/** Millimetres → points. */
function mm(value) {
	return value * PT_PER_MM;
}
/** Centimetres → points. */
function cm(value) {
	return value * PT_PER_CM;
}
/** Inches → points. */
function inch(value) {
	return value * PT_PER_INCH;
}
/**
* Pixels → points.
* @param value   Pixel count.
* @param dpi     Screen/print resolution in dots per inch. Defaults to 96 (CSS pixel).
*/
function px(value, dpi = 96) {
	return value * PT_PER_INCH / dpi;
}
/**
* Resolve a Dimension to points.
* - number → pass-through (already in points)
* - '20mm' → mm(20), '2cm' → cm(2), '0.5in' → inch(0.5), '100px' → px(100), '36pt' → 36
* @throws if the string format is unrecognised
*/
function parseDimension(d) {
	if (typeof d === "number") return d;
	const m = d.trim().match(/^(-?[\d.]+)(mm|cm|in|pt|px)$/i);
	if (!m) throw new Error(`Unrecognised dimension: "${d}" — expected format like "20mm", "2cm", "0.5in", "36pt", "100px"`);
	const value = parseFloat(m[1]);
	switch (m[2].toLowerCase()) {
		case "mm": return mm(value);
		case "cm": return cm(value);
		case "in": return inch(value);
		case "pt": return value;
		case "px": return px(value);
		default: throw new Error(`Unknown unit: "${m[2]}"`);
	}
}
//#endregion
//#region ../1c-layout/src/sizes.ts
/** Named page size → [width, height] in points. */
var PAGE_SIZES = {
	A0: [2383.94, 3370.39],
	A1: [1683.78, 2383.94],
	A2: [1190.55, 1683.78],
	A3: [841.89, 1190.55],
	A4: [595.28, 841.89],
	A5: [419.53, 595.28],
	A6: [297.64, 419.53],
	B4: [708.66, 1000.63],
	B5: [498.9, 708.66],
	SRA3: [907.09, 1275.59],
	SRA4: [637.8, 907.09],
	Letter: [612, 792],
	Legal: [612, 1008],
	Tabloid: [792, 1224],
	"JIS-B0": [2919.69, 4127.24],
	"JIS-B1": [2063.62, 2919.69],
	"JIS-B2": [1459.84, 2063.62],
	"JIS-B3": [1031.81, 1459.84],
	"JIS-B4": [728.5, 1031.81],
	"JIS-B5": [515.91, 728.5],
	"JIS-B6": [362.83, 515.91],
	C5: [459.21, 649.13],
	C6: [323.15, 459.21],
	DL: [311.81, 623.62]
};
/**
* Resolve a PageSize to a concrete [width, height] tuple in points.
* Pass-through for tuples; lookup for named sizes.
*/
function resolvePageSize(size) {
	if (Array.isArray(size)) return size;
	const result = PAGE_SIZES[size];
	if (result === void 0) throw new Error(`Unknown page size: "${String(size)}" — valid sizes: ${Object.keys(PAGE_SIZES).join(", ")}`);
	return result;
}
//#endregion
export { parseDimension as n, resolvePageSize as t };
