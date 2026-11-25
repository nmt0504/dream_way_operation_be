import { z } from 'zod';

import { passwordSchema } from '../../lib/password';

export const loginBody = z.object({
  // phone (0xxxxxxxxx) or username
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const changePasswordBody = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
});
