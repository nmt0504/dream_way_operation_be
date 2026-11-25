import { type SQL, asc, count, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '../../db';
import { branches, rooms } from '../../db/schema';
import { notFoundError } from '../../lib/app-error';
import { type Pagination, offsetOf, paged } from '../../lib/pagination';
import type { createRoomBody, updateRoomBody } from './rooms.schemas';

type RoomRow = typeof rooms.$inferSelect;

const toDto = (r: RoomRow) => ({
  id: r.id,
  branch_id: r.branchId,
  name: r.name,
  capacity: r.capacity,
});

// scope: null = every branch (admin), otherwise the branches the user may see
export async function listRooms(scope: string[] | null, p: Pagination) {
  const where: SQL | undefined = scope ? inArray(rooms.branchId, scope) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({ room: rooms })
      .from(rooms)
      .innerJoin(branches, eq(branches.id, rooms.branchId))
      .where(where)
      .orderBy(asc(branches.name), asc(rooms.name))
      .limit(p.page_size)
      .offset(offsetOf(p)),
    db.select({ value: count() }).from(rooms).where(where),
  ]);
  return paged(
    rows.map((r) => toDto(r.room)),
    total?.value ?? 0,
    p,
  );
}

export async function createRoom(body: z.infer<typeof createRoomBody>) {
  const [row] = await db
    .insert(rooms)
    .values({ branchId: body.branch_id, name: body.name, capacity: body.capacity })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return toDto(row);
}

export async function updateRoom(id: string, body: z.infer<typeof updateRoomBody>) {
  const [row] = await db
    .update(rooms)
    .set({ branchId: body.branch_id, name: body.name, capacity: body.capacity })
    .where(eq(rooms.id, id))
    .returning();
  if (!row) throw notFoundError('ROOM_NOT_FOUND', 'Không tìm thấy phòng');
  return toDto(row);
}
