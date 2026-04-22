#!/usr/bin/env tsx
// manual/scripts/mt-40-verapdf.ts
// MT-40 — veraPDF validation against paragraf PDF/A-1b output.
//
// Generates a representative paragraph PDF with a sRGB OutputIntent (PDF/A-1b)
// and runs veraPDF against it.  If veraPDF is not installed the test exits 0
// with a "SKIP" status and prints installation instructions.
//
// veraPDF binary discovery order:
//   1. PATH lookup (verapdf)
//   2. $HOME/verapdf/verapdf  (default install location on macOS/Linux)
//   3. /opt/verapdf/verapdf
//
// Installation:
//   macOS (Homebrew):  brew install verapdf
//   All platforms:     https://verapdf.org/home/#download
//
// Outputs:
//   mt-40-verapdf.pdf       — generated test document
//   mt-40-verapdf.json      — veraPDF MRR findings (or skip record)
//
// PASS criteria:
//   - veraPDF not found → SKIP (exit 0, findings status = "skipped")
//   - veraPDF found + no violations → PASS (exit 0, findings status = "passed")
//   - veraPDF found + violations    → FAIL (exit 1, findings status = "failed")
//
// Run:  tsx tests/manual/scripts/mt-40-verapdf.ts

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import { parseIccProfile, loadBuiltinSrgb } from '@paragraf/color';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import { writePdf, writeJson, outputPath } from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

// ─── PDF generation ───────────────────────────────────────────────────────────

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const fontEngine = await createDefaultFontEngine(registry);
const measurer = createMeasurer(registry);

const t0 = performance.now();
const paraOut = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const rendered = layoutParagraph(paraOut.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const composeMs = performance.now() - t0;

// Use the system sRGB ICC profile for the PDF/A-1b OutputIntent.
// This is the same profile veraPDF expects for sRGB-declared PDFs.
const SRGB_PROFILE_PATH = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';
const srgbProfileBytes = existsSync(SRGB_PROFILE_PATH)
  ? new Uint8Array(readFileSync(SRGB_PROFILE_PATH))
  : loadBuiltinSrgb().bytes;

let outputIntent;
try {
  const parsed = parseIccProfile(srgbProfileBytes);
  outputIntent = {
    profile: parsed,
    condition: 'sRGB IEC61966-2.1',
  };
} catch {
  // fallback: use loadBuiltinSrgb() from @paragraf/color
  const parsed = loadBuiltinSrgb();
  outputIntent = {
    profile: parsed,
    condition: 'sRGB',
  };
}

const pdfBytes = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  title: 'paragraf MT-40 veraPDF validation',
  lang: 'en-US',
  outputIntent,
  preDraw: (doc: any) => drawTestHeader(doc, 'MT-40'),
});

const pdfFile = 'mt-40-verapdf.pdf';
writePdf(pdfFile, pdfBytes);
const pdfPath = outputPath(pdfFile);

console.log(`\n  Compose time: ${composeMs.toFixed(1)}ms`);
console.log(`  PDF size:     ${(pdfBytes.length / 1024).toFixed(1)} KB`);

// ─── veraPDF discovery ────────────────────────────────────────────────────────

const VERAPDF_CANDIDATES = [
  'verapdf', // PATH
  path.join(os.homedir(), 'verapdf', 'verapdf'),
  '/opt/verapdf/verapdf',
  '/usr/local/bin/verapdf',
];

function findVeraPdf(): string | null {
  for (const candidate of VERAPDF_CANDIDATES) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (probe.status === 0 || (probe.error == null && probe.stdout)) {
      return candidate;
    }
  }
  return null;
}

// ─── veraPDF invocation ───────────────────────────────────────────────────────

interface VeraPdfFinding {
  ruleId: string;
  description: string;
  location?: string;
}

interface VeraPdfPdfResult {
  file: string;
  flavour: string;
  isCompliant: boolean;
  passedChecks: number;
  failedChecks: number;
  violations: VeraPdfFinding[];
  rawOutput?: string;
}

/**
 * Parse veraPDF MRR XML output into a structured result.
 * We look for <testAssertion> elements with status="FAILED".
 */
function parseMrr(xml: string, pdfFile: string): VeraPdfPdfResult {
  const isCompliant =
    xml.includes('isCompliant="true"') || xml.includes("isCompliant='true'");
  const failedMatches = xml.match(/status="FAILED"/g);
  const passedMatches = xml.match(/status="PASSED"/g);
  const failedChecks = failedMatches ? failedMatches.length : 0;
  const passedChecks = passedMatches ? passedMatches.length : 0;

  // Extract violation rules: <ruleId specification="..." clause="..." testNumber="..." />
  const violations: VeraPdfFinding[] = [];
  const rulePattern =
    /<ruleId\s+specification="([^"]+)"\s+clause="([^"]+)"\s+testNumber="([^"]+)"/g;
  const descPattern = /<description>([^<]+)<\/description>/g;

  const ruleMatches = [...xml.matchAll(rulePattern)];
  const descMatches = [...xml.matchAll(descPattern)];

  for (let i = 0; i < ruleMatches.length; i++) {
    const m = ruleMatches[i];
    const ruleId = `${m[1]}:${m[2]}-${m[3]}`;
    const description = descMatches[i] ? descMatches[i][1].trim() : '';
    violations.push({ ruleId, description });
  }

  // Deduplicate violations by ruleId
  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    if (seen.has(v.ruleId)) return false;
    seen.add(v.ruleId);
    return true;
  });

  // Flavour from XML: look for <validationResult flavour="..."
  const flavourMatch = xml.match(/flavour="([^"]+)"/);
  const flavour = flavourMatch ? flavourMatch[1] : '1b';

  return {
    file: pdfFile,
    flavour,
    isCompliant,
    passedChecks,
    failedChecks,
    violations: unique,
  };
}

// ─── Run ──────────────────────────────────────────────────────────────────────

type FindingsStatus = 'passed' | 'failed' | 'skipped';

interface Findings {
  test: string;
  timestamp: string;
  status: FindingsStatus;
  veraPdfVersion: string | null;
  installInstructions?: string;
  perf: { composeMs: number };
  pdfs: VeraPdfPdfResult[];
  notes: string[];
}

const veraPdf = findVeraPdf();

if (!veraPdf) {
  // ── SKIP path ──────────────────────────────────────────────────────────────
  console.log('\n  veraPDF not found in PATH or known locations.');
  console.log('  To install:');
  console.log('    macOS (Homebrew): brew install verapdf');
  console.log('    All platforms:    https://verapdf.org/home/#download');
  console.log('\n  MT-40 SKIP — PDF generated at:');
  console.log(`    ${pdfPath}`);
  console.log('  Re-run after installing veraPDF to get validation results.\n');

  const findings: Findings = {
    test: 'MT-40',
    timestamp: new Date().toISOString(),
    status: 'skipped',
    veraPdfVersion: null,
    installInstructions:
      'brew install verapdf  OR  https://verapdf.org/home/#download',
    perf: { composeMs: composeMs },
    pdfs: [
      {
        file: pdfFile,
        flavour: '1b',
        isCompliant: false,
        passedChecks: 0,
        failedChecks: 0,
        violations: [],
        rawOutput: '(not run — veraPDF not installed)',
      },
    ],
    notes: [
      'veraPDF was not found; validation was skipped.',
      `PDF generated at: ${pdfPath}`,
      'PDF has sRGB OutputIntent (PDF/A-1b intent) from sRGB IEC61966-2.1 profile.',
    ],
  };

  writeJson('mt-40-verapdf.json', findings);
  process.exit(0);
}

// ── veraPDF available path ─────────────────────────────────────────────────

// Get version string
const versionResult = spawnSync(veraPdf, ['--version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 10000,
});
const veraPdfVersion =
  (versionResult.stdout || '').trim().split('\n')[0] || 'unknown';
console.log(`\n  veraPDF: ${veraPdf}`);
console.log(`  Version: ${veraPdfVersion}`);

// Run validation in MRR (Machine Readable Report) mode, PDF/A-1b flavour.
// --flavour 1b  → validate as PDF/A-1b
// --format mrr  → XML machine-readable report
const validationResult = spawnSync(
  veraPdf,
  ['--flavour', '1b', '--format', 'mrr', pdfPath],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  },
);

const rawOutput = validationResult.stdout || '';
const rawError = validationResult.stderr || '';

let pdfResult: VeraPdfPdfResult;
if (validationResult.status === null || rawOutput.trim() === '') {
  // veraPDF crashed or timed out
  pdfResult = {
    file: pdfFile,
    flavour: '1b',
    isCompliant: false,
    passedChecks: 0,
    failedChecks: 1,
    violations: [
      {
        ruleId: 'INTERNAL',
        description: 'veraPDF process failed or timed out',
      },
    ],
    rawOutput: rawError || '(no output)',
  };
} else {
  pdfResult = parseMrr(rawOutput, pdfFile);
  pdfResult.rawOutput =
    rawOutput.length > 4096
      ? rawOutput.slice(0, 4096) + '\n… (truncated)'
      : rawOutput;
}

// ─── Report ───────────────────────────────────────────────────────────────────

const notes: string[] = [];

if (pdfResult.isCompliant) {
  console.log('\n  ✓  veraPDF: PDF/A-1b COMPLIANT');
  console.log(`     passed checks: ${pdfResult.passedChecks}`);
} else {
  console.log('\n  ✗  veraPDF: PDF/A-1b VIOLATIONS FOUND');
  console.log(
    `     passed: ${pdfResult.passedChecks}  failed: ${pdfResult.failedChecks}`,
  );
  console.log('');
  for (const v of pdfResult.violations) {
    console.log(`     [${v.ruleId}] ${v.description}`);
    notes.push(`Violation ${v.ruleId}: ${v.description}`);
  }
  if (pdfResult.violations.length === 0 && !pdfResult.isCompliant) {
    console.log(
      '     (violations present in XML but could not be parsed — see rawOutput)',
    );
    notes.push(
      'Violations present but XML parsing incomplete; inspect rawOutput field.',
    );
  }
}

const status: FindingsStatus = pdfResult.isCompliant ? 'passed' : 'failed';

const findings: Findings = {
  test: 'MT-40',
  timestamp: new Date().toISOString(),
  status,
  veraPdfVersion,
  perf: { composeMs: composeMs },
  pdfs: [pdfResult],
  notes,
};

writeJson('mt-40-verapdf.json', findings);

if (!pdfResult.isCompliant) {
  console.log(
    '\n  Note: PDF/A-1b violations are documented in mt-40-verapdf.json.',
  );
  console.log(
    '  These findings may reflect pdfkit limitations; code changes are',
  );
  console.log('  out of scope for MT-40 unless specifically triaged as P0.\n');
  process.exit(1);
}

process.exit(0);
