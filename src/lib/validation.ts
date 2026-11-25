import { z } from 'zod';

import { AppError } from './app-error';

// Validation messages in Vietnamese so the frontend can show them as-is
z.config(z.locales.vi());

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field = issue?.path.length ? issue.path.join('.') : undefined;
  throw new AppError(400, 'VALIDATION_ERROR', issue?.message ?? 'Dữ liệu không hợp lệ', field);
}

export const idParams = z.object({ id: z.uuid() });
export const phoneSchema = z
  .string()
  .regex(/^0[0-9]{9}$/, 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');
