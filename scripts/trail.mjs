#!/usr/bin/env node
// Runs the trail harness (a separate repository, a sibling of the main checkout) on this project.
// Works from the main checkout and from any worktree. TRAIL_HOME overrides the location.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const git = spawnSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { encoding: 'utf8' },
);
if (git.status !== 0) {
  console.error('trail: not inside a git repository');
  process.exit(1);
}
const home =
  process.env.TRAIL_HOME ?? resolve(dirname(git.stdout.trim()), '..', 'trail');
const tsx = resolve(home, 'node_modules', '.bin', 'tsx');
if (!existsSync(tsx)) {
  console.error(
    `trail: no harness at ${home} (run "npm install" there, or set TRAIL_HOME)`,
  );
  process.exit(1);
}
const r = spawnSync(
  tsx,
  [resolve(home, 'src', 'cli.ts'), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
