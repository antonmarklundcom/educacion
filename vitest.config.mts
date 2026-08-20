import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // PR-48: component tests render a server component with
  // `renderToStaticMarkup`, so vitest has to transform the JSX in the
  // component under test. Automatic runtime, matching `tsconfig.json` — a
  // component file needs no `import React`.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
