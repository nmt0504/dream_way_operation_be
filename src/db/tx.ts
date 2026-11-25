import { sql } from 'drizzle-orm';

import { db } from './index';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs fn in a transaction with app.actor_id set, so audit triggers record who did it.
export function withActor<T>(actorId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actorId}, true)`);
    return fn(tx);
  });
}
