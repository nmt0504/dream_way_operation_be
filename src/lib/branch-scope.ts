import type { AuthUser } from '../middlewares/authenticate';
import { AppError } from './app-error';

/**
 * Branch ids a list query must be limited to, or null for "every branch" (admin without ?branch_id=).
 * Passing a branch the user is not assigned to -> 403.
 */
export function branchScope(user: AuthUser, branchId?: string): string[] | null {
  if (branchId) {
    if (user.role !== 'admin' && !user.branchIds.includes(branchId)) {
      throw new AppError(
        403,
        'BRANCH_NOT_ASSIGNED',
        'Bạn không được gán vào cơ sở này',
        'branch_id',
      );
    }
    return [branchId];
  }
  return user.role === 'admin' ? null : user.branchIds;
}
