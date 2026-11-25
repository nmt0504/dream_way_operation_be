import { z } from 'zod';

import { paginationQuery } from '../../lib/pagination';

const name = z.string().trim().min(1).max(100);
const capacity = z.number().int().min(1).max(1000).nullable();

export const listRoomsQuery = paginationQuery.extend({
  branch_id: z.uuid().optional(),
});

export const createRoomBody = z.object({
  branch_id: z.uuid(),
  name,
  capacity: capacity.optional(),
});

export const updateRoomBody = z
  .object({
    // moving a room is rejected by a DB trigger while sessions of another branch still use it
    branch_id: z.uuid().optional(),
    name: name.optional(),
    capacity: capacity.optional(),
  })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    'Cần ít nhất một trường để cập nhật',
  );
