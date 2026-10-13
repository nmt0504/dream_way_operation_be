import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  throw 'Load env error';
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
