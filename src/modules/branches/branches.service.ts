import { type SQL, asc, count, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '../../db';
import { branches } from '../../db/schema';
import { notFoundError } from '../../lib/app-error';
import { type Pagination, offsetOf, paged } from '../../lib/pagination';
import type { createBranchBody, updateBranchBody } from './branches.schemas';

type BranchRow = typeof branches.$inferSelect;

const toDto = (b: BranchRow) => ({
  id: b.id,
  name: b.name,
  address: b.address,
  created_at: b.createdAt,
});

// scope: null = every branch (admin), otherwise the user's assigned branches
export async function listBranches(scope: string[] | null, p: Pagination) {
  const where: SQL | undefined = scope ? inArray(branches.id, scope) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(branches)
      .where(where)
      .orderBy(asc(branches.name), asc(branches.id))
      .limit(p.page_size)
      .offset(offsetOf(p)),
    db.select({ value: count() }).from(branches).where(where),
  ]);
  return paged(rows.map(toDto), total?.value ?? 0, p);
}

export async function createBranch(body: z.infer<typeof createBranchBody>) {
  const [row] = await db
    .insert(branches)
    .values({ name: body.name, address: body.address })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return toDto(row);
}

export async function updateBranch(id: string, body: z.infer<typeof updateBranchBody>) {
  const [row] = await db
    .update(branches)
    .set({ name: body.name, address: body.address })
    .where(eq(branches.id, id))
    .returning();
  if (!row) throw notFoundError('BRANCH_NOT_FOUND', 'Không tìm thấy cơ sở');
  return toDto(row);
}
