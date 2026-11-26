// Prints line/branch/function coverage per published package from each
// workspace's coverage/coverage-summary.json (written by
// `npm run test:coverage`). In GitHub Actions the table is also added to the
// job summary. Exits 1 if a published package has no coverage summary.
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const { workspaces } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
);

const rows = [];
const missing = [];
for (const ws of workspaces) {
  const pkg = JSON.parse(readFileSync(join(root, ws, 'package.json'), 'utf8'));
  if (pkg.private) continue; // demo, studio: not published
  const file = join(root, ws, 'coverage', 'coverage-summary.json');
  if (!existsSync(file)) {
    missing.push(pkg.name);
    continue;
  }
  const t = JSON.parse(readFileSync(file, 'utf8')).total;
  rows.push([pkg.name, t.lines.pct, t.branches.pct, t.functions.pct]);
}

const lines = [
  '| Package | Lines % | Branches % | Functions % |',
  '|---|---:|---:|---:|',
  ...rows.map((r) => `| ${r.join(' | ')} |`),
];
const table = lines.join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Unit test coverage\n\n${table}\n`,
  );
}
if (missing.length) {
  console.error(`No coverage summary for: ${missing.join(', ')}`);
  process.exit(1);
}
