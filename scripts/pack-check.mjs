#!/usr/bin/env node
/**
 * Packs every publishable @paragraf/* package and checks the tarball is what
 * a user must receive. Run after `npm run build` and after both WASM builds.
 *
 *   node scripts/pack-check.mjs                 # check only (tarballs in a temp dir)
 *   node scripts/pack-check.mjs --out <dir>     # also keep the tarballs in <dir>
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */

import { execFileSync } from 'child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Workspace folder → extra files that package must contain.
export const PACKAGES = {
  '0-types': [],
  '0-color': [],
  '2c-color-wasm': [
    'wasm/pkg/color_wasm.js',
    'wasm/pkg/color_wasm_bg.wasm',
    'wasm/pkg/package.json',
  ],
  '1a-linebreak': [],
  '1b-font-engine': [],
  '1c-layout': [],
  '1d-style': [],
  '2a-shaping-wasm': [
    'wasm/pkg/paragraf_shaping_wasm.js',
    'wasm/pkg/paragraf_shaping_wasm_bg.wasm',
    'wasm/pkg/package.json',
    'wasm/pkg-bundler/paragraf_shaping_wasm.js',
    'wasm/pkg-bundler/paragraf_shaping_wasm_bg.wasm',
    'wasm/pkg-bundler/package.json',
  ],
  '2b-render-core': [],
  '3a-typography': [],
  '3b-render-pdf': [],
  '4a-template': [],
  '4b-compile': [],
};

const ALWAYS = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
];

// Nothing matching these may be in a tarball.
const FORBIDDEN = [
  /^tests?\//,
  /^src\//,
  /\.test\.[cm]?[jt]s$/,
  /\.tgz$/,
  /^wasm\/target\//,
  /^wasm\/src\//,
  /(^|\/)\.gitignore$/,
  /^node_modules\//,
];

const outArg = process.argv.indexOf('--out');
const outDir =
  outArg > -1
    ? resolve(process.argv[outArg + 1])
    : mkdtempSync(join(tmpdir(), 'paragraf-pack-'));
mkdirSync(outDir, { recursive: true });

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const rootVersion = readJson(join(root, '0-types/package.json')).version;

let failures = 0;
const fail = (pkg, msg) => {
  failures++;
  console.log(`  FAIL ${pkg}: ${msg}`);
};

console.log(`Packing ${Object.keys(PACKAGES).length} packages into ${outDir}\n`);

for (const [dir, extra] of Object.entries(PACKAGES)) {
  const cwd = join(root, dir);
  const before = readFileSync(join(cwd, 'package.json'), 'utf8');
  const name = JSON.parse(before).name;

  let info;
  try {
    const out = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', outDir],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    info = JSON.parse(out)[0];
  } catch (e) {
    fail(name, `npm pack failed: ${e.stderr || e.message}`);
    continue;
  }

  const files = info.files.map((f) => f.path);
  const has = (p) => files.includes(p);

  for (const p of [...ALWAYS, ...extra]) {
    if (!has(p)) fail(name, `missing ${p}`);
  }
  for (const f of files) {
    if (FORBIDDEN.some((re) => re.test(f))) fail(name, `must not ship ${f}`);
  }

  // The manifest inside the tarball is what npm and Node will read.
  const tarball = join(outDir, info.filename);
  const packed = JSON.parse(
    execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );

  if (packed.version !== rootVersion) {
    fail(name, `version ${packed.version}, expected ${rootVersion}`);
  }
  if (packed.private) fail(name, 'is marked private');
  if (packed.publishConfig?.access !== 'public') {
    fail(name, 'publishConfig.access is not "public"');
  }
  if (packed.license !== 'MIT') fail(name, 'license is not MIT');
  if (!packed.repository) fail(name, 'no repository field');

  const exp = packed.exports?.['.'];
  if (exp?.import !== './dist/index.js' || exp?.types !== './dist/index.d.ts') {
    fail(
      name,
      `exports do not point at dist (got ${JSON.stringify(packed.exports)})`,
    );
  }
  for (const [k, v] of Object.entries(packed.exports ?? {})) {
    const targets = typeof v === 'string' ? [v] : Object.values(v);
    for (const t of targets) {
      if (typeof t !== 'string') continue;
      if (t.includes('/src/')) fail(name, `export "${k}" points at source: ${t}`);
      else if (!has(t.replace(/^\.\//, ''))) {
        fail(name, `export "${k}" points at a file not in the tarball: ${t}`);
      }
    }
  }

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(packed[field] ?? {})) {
      if (!dep.startsWith('@paragraf/')) continue;
      if (range !== `^${rootVersion}`) {
        fail(name, `${field}.${dep} is "${range}", expected "^${rootVersion}"`);
      }
    }
  }

  // prepack rewrites package.json and postpack must put it back.
  const after = readFileSync(join(cwd, 'package.json'), 'utf8');
  if (after !== before) fail(name, 'package.json was not restored after packing');
  if (JSON.parse(after)._dev_exports) fail(name, '_dev_exports left behind');

  console.log(
    `  ${name}@${packed.version}  ${files.length} files  ${(info.size / 1024).toFixed(0)} kB`,
  );
}

const tarballs = readdirSync(outDir).filter((f) => f.endsWith('.tgz'));
if (tarballs.length !== Object.keys(PACKAGES).length) {
  failures++;
  console.log(
    `  FAIL expected ${Object.keys(PACKAGES).length} tarballs, found ${tarballs.length}`,
  );
}

if (!existsSync(join(root, 'studio/package.json')) || !readJson(join(root, 'studio/package.json')).private) {
  failures++;
  console.log('  FAIL studio must be private');
}
if (!readJson(join(root, 'demo/package.json')).private) {
  failures++;
  console.log('  FAIL demo must be private');
}

console.log(
  failures === 0
    ? `\nPack check passed: ${tarballs.length} tarballs in ${outDir}`
    : `\nPack check FAILED: ${failures} problem(s)`,
);
process.exit(failures === 0 ? 0 : 1);
