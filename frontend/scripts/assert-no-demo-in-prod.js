/**
 * Guards the production bundle against shipping demo-mode fixtures.
 *
 * WHY THIS EXISTS
 * ---------------
 * Demo mode is enabled by a build-time flag. A stale or mistyped flag would
 * therefore produce a production build that silently serves fake data to real
 * users - and, because everything would look and behave normally, nothing would
 * fail loudly. That is the worst possible failure mode, so the claim that the
 * fixture module is tree-shaken out of a normal build is asserted here rather
 * than trusted.
 *
 * Run after `npm run build`. Exits non-zero, and therefore fails CI, if any
 * marker is found in dist/.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: the latter percent-encodes the path, so a
// directory containing a space - as this one does - would resolve to a
// non-existent location and report an empty dist, failing the check for the
// wrong reason.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/**
 * Strings that exist only in the fixture layer. Chosen to be unique to it, so
 * a match is unambiguous evidence that demo code reached the bundle. Generic
 * words such as "demo" are avoided on purpose - UI copy may legitimately use
 * them, and a false positive here would just train people to ignore the check.
 *
 * The set is deliberately broad, because it was once too narrow and the check
 * passed while a whole fixture generator sat in the live bundle. These are the
 * two shapes that leaked then: the password constant, which tree-shaking did
 * remove, and the customer-email generator, which it could not, because running
 * the generator is a side effect. Searching only for the password would have
 * reported "clean" through that whole bug.
 */
const FIXTURE_MARKERS = [
  'demo-csrf-token',
  'DemoCustomer!2026',
  'mulberry32',
  // The email template the fixture generator builds each customer with.
  'demo.user',
  // Copy that only the demo credential panel renders.
  'Demo mode - no backend',
  // Presentational only: a benign form is not proof the fixtures are absent.
  'lms-oc.test',
];

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? collectFiles(full)
      : extname(full) === '.js'
        ? [full]
        : [];
  });
}

const files = collectFiles(DIST);

if (files.length === 0) {
  console.error('dist/ contains no JavaScript. Run `npm run build` first.');
  process.exit(1);
}

const breaches = [];

for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  for (const marker of FIXTURE_MARKERS) {
    if (contents.includes(marker)) {
      breaches.push(`${marker}  ->  ${file}`);
    }
  }
}

if (breaches.length > 0) {
  console.error('Production bundle contains demo-mode fixtures:');
  breaches.forEach((b) => console.error(`  ${b}`));
  console.error('\nA real deployment would be serving fake data. Fix the build flags.');
  process.exit(1);
}

console.log(
  `OK: ${files.length} bundle file(s) scanned, no demo fixtures present. `
  + 'Demo mode is excluded from the production build.',
);
