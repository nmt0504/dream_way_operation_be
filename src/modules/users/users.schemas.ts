import { z } from 'zod';

import { passwordSchema } from '../../lib/password';
import { OPERATION_ROLES } from '../../lib/permissions';
import { phoneSchema } from '../../lib/validation';

const fullName = z.string().trim().min(1).max(100);

export const createUserBody = z.object({
  full_name: fullName,
  phone: phoneSchema,
  role: z.enum(OPERATION_ROLES),
  // temporary password; the user must change it at first login
  password: passwordSchema,
  teacher_id: z.uuid().optional(),
});

export const updateUserBody = z
  .object({
    full_name: fullName.optional(),
    role: z.enum(OPERATION_ROLES).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    // null unlinks the teacher profile
    teacher_id: z.uuid().nullable().optional(),
  })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    'Cần ít nhất một trường để cập nhật',
  );

export const setBranchesBody = z.object({
  branch_ids: z.array(z.uuid()).max(100),
});

export const resetPasswordBody = z.object({
  password: passwordSchema,
});
