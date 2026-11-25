import { z } from 'zod';

// Reminder channel / send time are phase 5 fields and are not accepted yet
export const updateSettingsBody = z
  .object({
    center_name: z.string().trim().min(1).max(100).optional(),
    logo_url: z.url().max(2048).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    revenue_target: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (b) => Object.values(b).some((v) => v !== undefined),
    'Cần ít nhất một trường để cập nhật',
  );
