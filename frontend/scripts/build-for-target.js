/**
 * Builds the frontend for a deployment target, chosen by NETLIFY_TARGET.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two different builds have to come out of the same repository:
 *
 *   live  - talks to the real API on Render. The default.
 *   demo  - answers its own API calls from in-memory fixtures, so the site
 *           works with no backend, no database and no credentials. This is the
 *           build to use for a presentation.
 *
 * Doing this in netlify.toml alone is not possible, because Vite chooses which
 * `.env.<mode>` file to load from a CLI flag rather than an environment
 * variable, and a shell-specific `NETLIFY_TARGET=demo vite build --mode demo`
 * line would break on Windows. One script is portable and keeps the decision,
 * including the safety check below, in one reviewable place.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VITE_CLI = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const ASSERT_CLI = fileURLToPath(new URL('./assert-no-demo-in-prod.js', import.meta.url));

const target = (process.env.NETLIFY_TARGET ?? 'live').toLowerCase();
const isDemo = target === 'demo';

if (!['live', 'demo'].includes(target)) {
  console.error(
    `NETLIFY_TARGET is "${target}". Expected "live" or "demo".\n`
    + 'Refusing to build: an unrecognised target could quietly produce a site '
    + 'wired to the wrong backend.',
  );
  process.exit(1);
}

console.log(`Building the "${target}" target.\n`);

/**
 * Runs a Node script as a child process.
 *
 * The CLI is invoked through `process.execPath` rather than by shelling out to
 * `npm`. On Windows, `npm` resolves to npm.cmd, and a .cmd file cannot be
 * spawned without a shell - which is why the earlier version of this script
 * exited with a bare status 1 and no message. Going straight to node also
 * removes a shell-quoting failure mode from the build path.
 */
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (result.error) {
    // Never exit on a bare status: a silent failure in a deploy script is
    // indistinguishable from a successful build until it is far too late.
    console.error(`Failed to run ${script}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(VITE_CLI, ['build', ...(isDemo ? ['--mode', 'demo'] : [])]);

if (!isDemo) {
  // Not optional. Demo mode is excluded from this build only because
  // tree-shaking removes the unreachable branch, which is precisely the kind
  // of thing that silently stops being true on an upgrade. If fixtures ever
  // reached a live site it would serve fake data to real users and nothing
  // would look wrong, so the bundle is inspected rather than assumed.
  run(ASSERT_CLI, []);
}

// Fail here rather than letting the deploy report success on an empty site.
const dist = fileURLToPath(new URL('../dist/index.html', import.meta.url));
if (!existsSync(dist)) {
  console.error(`Build reported success but ${dist} is missing.`);
  process.exit(1);
}

console.log(`\nDone. "${target}" build is in frontend/dist.`);
