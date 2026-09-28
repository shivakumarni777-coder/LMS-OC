/**
 * Whether the app is running against in-memory demo data.
 *
 * A single definition, read from one place, because the flag is load-bearing in
 * two directions:
 *
 *   - it decides whether the transport is swapped for the demo adapter, and
 *   - it decides whether the demo credentials are shown on the login page.
 *
 * Vite substitutes `import.meta.env.VITE_DEMO_MODE` at build time, so in a
 * normal build this is the constant `false`, both branches become statically
 * dead, and the demo modules are tree-shaken out. `npm run verify:no-demo-in-prod`
 * then greps the emitted bundle to confirm that actually happened, because a
 * credential quietly shipping to a real site is not a failure anyone would
 * otherwise notice.
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
