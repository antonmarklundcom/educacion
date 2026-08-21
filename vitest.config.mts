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
  },
});
