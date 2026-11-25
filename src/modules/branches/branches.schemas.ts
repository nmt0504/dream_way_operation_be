import { z } from 'zod';

const name = z.string().trim().min(1).max(100);
const address = z.string().trim().max(500).nullable();

export const createBranchBody = z.object({
  name,
  address: address.optional(),
});

export const updateBranchBody = z
  .object({ name: name.optional(), address: address.optional() })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    'Cần ít nhất một trường để cập nhật',
  );
