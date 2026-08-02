import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit DOES auto-load `.env` (tsx does not — docs/deployment.md §5),
 * so `npm run db:generate` and `npm run db:migrate` pick up `.env.local`
 * or a shell-exported DATABASE_URL. Migrations are applied from a local
 * machine against Hostinger's Remote MySQL, never from the deployed app.
 */
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
