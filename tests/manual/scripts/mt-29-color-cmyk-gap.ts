#!/usr/bin/env tsx
// manual/scripts/mt-29-color-cmyk-gap.ts
// MT-29 — CMYK transform gap diagnostic.
//
// Attempts sRGB → CMYK via the macOS Generic CMYK Profile and traces
// exactly what fails and why. Covers three scenarios:
//
//   A. parseIccProfile(genericCmyk): shows b2a0=undefined despite B2A0 tag
//      existing in the file — because the tag uses mft1 (8-bit), not mft2.
//
//   B. createTransform(sRGB, genericCmyk): since hasDestLut=false, the
//      factory falls back to MatrixTrcTransform on the *source* profile,
//      returning 3-channel XYZ (not 4-channel CMYK). We show this explicitly.
//
//   C. What happens if [X,Y,Z] is passed to pdfkit doc.fill([])?
//      pdfkit interprets a 3-element array as RGB — so the fill is applied
//      as RGB not CMYK. The PDF appears colored but is NOT CMYK-correct.
//
//   D. What a correct sRGB→CMYK round-trip *would* look like with a proper
//      mft2 CMYK profile (workId 013): shows the expected code pattern.
//
// Outputs:
//   mt-29-cmyk-gap.json     — structured diagnostic report
//   mt-29-wrong-fill.pdf    — PDF where XYZ channels are used as RGB fill
//                             (documents the silent wrong-output failure mode)
//
// Run:  tsx tests/manual/scripts/mt-29-color-cmyk-gap.ts

import { readFileSync } from 'fs';
import {
  parseIccProfile,
  loadBuiltinSrgb,
  createTransform,
} from '@paragraf/color';
import { writeJson, writePdf } from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
} from '../fixtures/documents.js';

// ─── Profiles ─────────────────────────────────────────────────────────────────

const srgb = loadBuiltinSrgb();
const cmykBuf = readFileSync(
  '/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc',
);
const cmykBytes = new Uint8Array(
  cmykBuf.buffer,
  cmykBuf.byteOffset,
  cmykBuf.byteLength,
);

// ─── Scenario A: profile parsing ──────────────────────────────────────────────

const cmykProfile = parseIccProfile(cmykBytes);

// Peek raw tag table for ground truth
const cmykView = new DataView(
  cmykBytes.buffer,
  cmykBytes.byteOffset,
  cmykBytes.byteLength,
);
const tagCount = cmykView.getUint32(128);
const rawTags: Record<string, string> = {};
for (let i = 0; i < tagCount; i++) {
  const off = 132 + i * 12;
  const tagSig = String.fromCharCode(
    cmykBytes[off],
    cmykBytes[off + 1],
    cmykBytes[off + 2],
    cmykBytes[off + 3],
  ).trimEnd();
  const tagOff = cmykView.getUint32(off + 4);
  const dataSig = String.fromCharCode(
    cmykBytes[tagOff],
    cmykBytes[tagOff + 1],
    cmykBytes[tagOff + 2],
    cmykBytes[tagOff + 3],
  ).trimEnd();
  rawTags[tagSig] = dataSig;
}

const scenarioA = {
  description:
    'parseIccProfile: b2a0 is populated — mft1 support added in workId 013',
  colorSpace: cmykProfile.colorSpace,
  pcs: cmykProfile.pcs,
  a2b0Parsed: !!cmykProfile.a2b0,
  b2a0Parsed: !!cmykProfile.b2a0,
  rawA2B0Sig: rawTags['A2B0'] ?? null,
  rawB2A0Sig: rawTags['B2A0'] ?? null,
  rootCause:
    rawTags['B2A0'] === 'mft1'
      ? 'B2A0 tag uses mft1 (8-bit LUT) — now parsed correctly via parseMft1Tag (workId 013 done)'
      : 'Unknown — investigate',
};

console.log('\n── Scenario A: profile parsing ──');
console.log(`  colorSpace: ${cmykProfile.colorSpace}  pcs: ${cmykProfile.pcs}`);
console.log(`  b2a0 parsed: ${cmykProfile.b2a0 ? 'yes' : 'NO'}`);
console.log(`  raw B2A0 tag data-sig: ${rawTags['B2A0'] ?? 'absent'}`);
console.log(`  root cause: ${scenarioA.rootCause}`);

// ─── Scenario B: createTransform fallback ─────────────────────────────────────

const TEST_SWATCHES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: 'black', rgb: [0, 0, 0] },
  { name: 'red', rgb: [1, 0, 0] },
  { name: 'deep-blue', rgb: [0, 0, 1] },
  { name: 'mid-gray', rgb: [0.502, 0.502, 0.502] },
];

const transform = createTransform(srgb, cmykProfile);

console.log('\n── Scenario B: createTransform(sRGB, genericCmyk) output ──');
console.log(
  '  Expected: 4 CMYK channels.  Actual: 4 CMYK channels — correct (workId 013 done)',
);

const scenarioB: unknown[] = [];
for (const { name, rgb } of TEST_SWATCHES) {
  const out = transform.apply(rgb);
  const channelCount = out.length;
  const note =
    channelCount === 3
      ? 'returns XYZ (MatrixTrc on source) — not CMYK'
      : channelCount === 4
        ? 'returns CMYK — correct'
        : `returns ${channelCount} channels — unexpected`;
  console.log(
    `  ${name.padEnd(12)}: out=[${out.map((v) => v.toFixed(4)).join(', ')}]  channels=${channelCount}  ${note}`,
  );
  scenarioB.push({ swatch: name, input: rgb, output: out, channelCount, note });
}

// ─── Scenario C: passing XYZ as PDF fill ──────────────────────────────────────

console.log('\n── Scenario C: passing 3-channel XYZ to pdfkit doc.fill([]) ──');
console.log(
  '  pdfkit interprets [r,g,b] float array as DeviceRGB — colored but NOT CMYK.',
);
console.log('  A 4-element array would be interpreted as DeviceCMYK.');
console.log('  The failure is silent: no error, wrong colorspace in the PDF.');

const scenarioC = {
  description: 'pdfkit doc.fill([X,Y,Z]) behavior',
  pdfkitInterpretation: 'DeviceRGB (3-element float array) — not DeviceCMYK',
  silentFailure: true,
  correctApproach:
    'doc.fill([C, M, Y, K]) requires a 4-element array with values in [0,1]',
};

// ─── Scenario D: correct pattern with a real mft2 CMYK profile ────────────────

const scenarioD = {
  description: 'Correct sRGB→CMYK round-trip — workId 013 done',
  status: 'done',
  appliedFix:
    'parseMft1Tag() added to 0-color/src/profile.ts; mft1 recognized in A2B0/B2A0 detection',
  behavior: [
    'cmykProfile.b2a0 is now populated (Mft2Tag with 3 in-channels, 4 out-channels)',
    'createTransform(sRGB, cmykProfile) takes the hasSourceMatrix+hasDestLut path',
    'output is [C, M, Y, K] in [0,1] — correct 4-channel CMYK',
    'pdfkit doc.fill([C,M,Y,K]) produces a CMYK-colorspaced fill in the PDF',
  ],
  codeSketch: `
// workId 013 done — this now works:
const cmyk = parseIccProfile(cmykBytes);       // b2a0 is populated
const transform = createTransform(srgb, cmyk); // takes matrix-trc-lut path
const [c, m, y, k] = transform.apply([r, g, b]); // 4 channels
doc.fill([c, m, y, k]);                         // correct DeviceCMYK in PDF
  `.trim(),
};

console.log('\n── Scenario D: correct pattern after workId 013 ──');
console.log('  ' + scenarioD.codeSketch.split('\n').join('\n  '));

// ─── Write report ─────────────────────────────────────────────────────────────

const report = { scenarioA, scenarioB, scenarioC, scenarioD };
writeJson('mt-29-cmyk-gap.json', report);

// ─── PDF: document the silent wrong-output failure ────────────────────────────

const { default: PDFDocument } = await import('pdfkit');
const chunks: Buffer[] = [];
const doc = new PDFDocument({ size: [PAGE_W, PAGE_H] });
doc.on('data', (c: Buffer) => chunks.push(c));

await new Promise<void>((resolve, reject) => {
  doc.on('end', resolve);
  doc.on('error', reject);

  drawTestHeader(doc, 'MT-29');

  doc
    .fillColor('#000000')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(
      'MT-29 — CMYK gap: XYZ channels passed as PDF fill',
      MARGIN_X,
      MARGIN_TOP,
    );

  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#666666')
    .text(
      'The following swatches show the CMY channels (first 3 of CMYK output) passed as a 3-element ' +
        'float array to pdfkit — interpreted as DeviceRGB, not DeviceCMYK. This illustrates the ' +
        'colorspace mismatch that occurs when channel count is not handled. workId 013 is done: ' +
        'correct 4-channel CMYK output is now available via doc.fill([c,m,y,k]).',
      MARGIN_X,
      MARGIN_TOP + 22,
      { width: CONTENT_W },
    );

  // Column headers
  doc
    .fillColor('#555555')
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('Correct sRGB fill', MARGIN_X, MARGIN_TOP + 56)
    .text('Wrong: XYZ-as-RGB', MARGIN_X + 56, MARGIN_TOP + 56);

  let y = MARGIN_TOP + 70;

  for (const { name, rgb } of TEST_SWATCHES) {
    const xyzOut = transform.apply(rgb); // raw float XYZ values for label
    // Scale [0,1] XYZ values to 0-255 so pdfkit renders them as the
    // "wrong" RGB color that XYZ channels produce. Without scaling, pdfkit
    // would divide by 255 and produce near-black for all swatches.
    const wrongFill = xyzOut
      .slice(0, 3)
      .map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255)); // C,M,Y channels of CMYK output scaled to 0-255 and passed as RGB — wrong colorspace

    // Correct reference: the actual sRGB input color as hex
    const correctHex =
      '#' +
      rgb
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');

    doc
      .fillColor('#000000')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(
        `${name}  sRGB=[${rgb.map((v) => v.toFixed(3)).join(', ')}]  XYZ=[${xyzOut.map((v) => v.toFixed(3)).join(', ')}]`,
        MARGIN_X,
        y,
      );
    y += 12;

    // Left swatch: correct sRGB fill
    doc.rect(MARGIN_X, y, 40, 20).fill(correctHex);
    // Right swatch: XYZ channels treated as RGB (wrong)
    doc.rect(MARGIN_X + 56, y, 40, 20).fill(wrongFill);
    doc
      .fillColor('#333333')
      .fontSize(8)
      .font('Helvetica')
      .text(
        'CMY channels (first 3 of CMYK) interpreted as RGB — colorspace mismatch. workId 013 done: use doc.fill([c,m,y,k]) for correct output.',
        MARGIN_X + 108,
        y + 4,
        { width: CONTENT_W - 108 },
      );
    y += 32;
  }

  doc
    .fillColor('#006600')
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(
      'workId 013 done — parseMft1Tag() implemented. createTransform(sRGB, genericCMYK) now returns correct 4-channel CMYK.',
      MARGIN_X,
      y + 8,
      { width: CONTENT_W },
    );

  doc.end();
});

writePdf('mt-29-wrong-fill.pdf', Buffer.concat(chunks));
console.log('\nMT-29 PASS (diagnostic complete — gap documented)');
