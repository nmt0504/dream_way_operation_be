import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationQuery>;

export const offsetOf = (p: Pagination) => (p.page - 1) * p.page_size;

export const paged = <T>(data: T[], total: number, p: Pagination) => ({
  data,
  meta: { page: p.page, page_size: p.page_size, total },
});
