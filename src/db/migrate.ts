// Applies pending migrations from ./drizzle at deploy time (drizzle-kit is a devDependency
// and is not installed in the production image). Uses the same migrations table as drizzle-kit,
// so migrations already applied with `pnpm db:migrate` are skipped.
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { logger } from '../config/logger';
import { db, pool } from './index';

async function main() {
  await migrate(db, { migrationsFolder: 'drizzle' });
  logger.info('Migrations applied');
}

main()
  .catch((err: unknown) => {
    logger.error(err, 'Migration failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
