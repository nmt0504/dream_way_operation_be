// Creates the test database if needed and applies every migration in ./drizzle.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject) {
  // DATABASE_URL here is the test database set in vitest.config.mts
  const TEST_DATABASE_URL = project.config.env.DATABASE_URL!;
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  const admin = new Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).href,
  });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' });
  await pool.end();
}
