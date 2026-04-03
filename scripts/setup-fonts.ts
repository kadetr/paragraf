/**
 * scripts/setup-fonts.ts
 *
 * Verifies that every font listed in scripts/fonts-manifest.json exists under
 * fonts/ and matches its expected SHA-256 hash.  Exits with code 1 on any
 * mismatch so CI fails loudly rather than running tests against corrupt or
 * missing font files.
 *
 * Usage:
 *   node --import tsx/esm scripts/setup-fonts.ts
 *   # or via the package.json script:
 *   npm run verify-fonts
 *
 * The fonts themselves are committed to the repository under fonts/.
 * If you need to recreate them, fetch the originals from:
 *   - Liberation fonts  https://github.com/liberationfonts/liberation-fonts/releases
 *   - Roboto            https://github.com/googlefonts/roboto
 *   - Noto Sans         https://github.com/notofonts/noto-fonts
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fontsDir = resolve(root, 'fonts');
const manifestPath = resolve(__dirname, 'fonts-manifest.json');

interface FontEntry {
  filename: string;
  sha256: string;
}
interface Manifest {
  fonts: FontEntry[];
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main(): Promise<void> {
  const manifest: Manifest = JSON.parse(
    await import('node:fs/promises').then((fs) =>
      fs.readFile(manifestPath, 'utf8'),
    ),
  );

  let ok = 0;
  let failed = 0;

  for (const entry of manifest.fonts) {
    const filePath = resolve(fontsDir, entry.filename);

    if (!existsSync(filePath)) {
      console.error(`  MISSING  ${entry.filename}`);
      failed++;
      continue;
    }

    const actual = await sha256File(filePath);
    if (actual !== entry.sha256) {
      console.error(
        `  MISMATCH ${entry.filename}\n` +
          `           expected ${entry.sha256}\n` +
          `           got      ${actual}`,
      );
      failed++;
    } else {
      console.log(`  OK       ${entry.filename}`);
      ok++;
    }
  }

  console.log(
    `\n${ok} OK, ${failed} failed out of ${manifest.fonts.length} fonts.`,
  );

  if (failed > 0) {
    console.error(
      '\nFont verification failed. Re-fetch affected fonts from their upstream sources\n' +
        'and ensure the files match the hashes in scripts/fonts-manifest.json.',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
