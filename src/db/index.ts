import { defineRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../config/env';
import * as schema from './schema';

export const pool = new Pool({ connectionString: env.databaseUrl });

const relations = defineRelations(schema);
export const db = drizzle({ client: pool, relations });
