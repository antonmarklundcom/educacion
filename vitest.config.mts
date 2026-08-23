import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // PR-48: component tests render a server component with
  // `renderToStaticMarkup`, so vitest has to transform the JSX in the component
  // under test — `tsconfig.json` sets `jsx: preserve`, which hands that job to
  // Next's compiler and leaves vitest nothing to run. The automatic runtime is
  // what Next itself compiles to, so a component file needs no `import React`
  // in either pipeline; this line does not "match tsconfig.json", it supplies
  // what tsconfig deliberately defers (corrected in PR-48b).
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    /**
     * PR-51: **visibility, not a gate.** `npm run test:coverage` prints the
     * number; nothing fails on it, and no threshold is configured — a threshold
     * picked before anybody has seen the figure is a number invented to be met,
     * and the first thing it buys is a test written to raise it. One arrives
     * when the real number is known and somebody decides what it should be.
     *
     * CI does not run it: `npm test` is untouched, so the PR check costs what
     * it cost before (CLAUDE.md rule 11).
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        // Route and page modules: `next build` type-checks them and the suite
        // exercises the functions they call, so counting their JSX as
        // uncovered lines says nothing anybody can act on.
        'src/app/**/{page,layout,error,route,not-found,opengraph-image}.tsx',
        'src/app/**/{page,layout,error,route,sitemap,robots}.ts',
        'src/db/schema.ts',
      ],
    },
  },
});
