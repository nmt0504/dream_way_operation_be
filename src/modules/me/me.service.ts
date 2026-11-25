import { asc } from 'drizzle-orm';

import { db } from '../../db';
import { branches } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { ROLE_PERMISSIONS } from '../../lib/permissions';
import type { AuthUser } from '../../middlewares/authenticate';

export async function getMe(authUser: AuthUser) {
  const user = await db.query.users.findFirst({
    where: { id: authUser.id },
    columns: { id: true, fullName: true, phone: true, username: true, role: true },
    with: { branches: { columns: { id: true, name: true }, orderBy: { name: 'asc' } } },
  });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập');

  const teacher = await db.query.teachers.findFirst({
    where: { userId: authUser.id },
    columns: { id: true },
    with: {
      classes: { columns: { id: true, name: true, status: true }, orderBy: { name: 'asc' } },
    },
  });

  // Admins have no user_branches rows but see the whole center
  const visibleBranches =
    authUser.role === 'admin'
      ? await db
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .orderBy(asc(branches.name))
      : user.branches;

  return {
    id: user.id,
    full_name: user.fullName,
    phone: user.phone,
    username: user.username,
    role: authUser.role,
    must_change_password: authUser.mustChangePassword,
    teacher_id: teacher?.id ?? null,
    branches: visibleBranches,
    classes: teacher?.classes ?? [],
    permissions: ROLE_PERMISSIONS[authUser.role],
  };
}
