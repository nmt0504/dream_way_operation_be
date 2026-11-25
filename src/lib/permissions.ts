// Roles allowed to log in to the operations app. parent/student never log in here.
export const OPERATION_ROLES = ['admin', 'staff', 'teacher'] as const;
export type OperationRole = (typeof OPERATION_ROLES)[number];

export const isOperationRole = (role: string): role is OperationRole =>
  (OPERATION_ROLES as readonly string[]).includes(role);

export const PERMISSIONS = [
  'users.manage',
  'settings.manage',
  'branches.read',
  'branches.manage',
  'rooms.read',
  'rooms.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Static map; later phases append their permission codes here.
export const ROLE_PERMISSIONS: Record<OperationRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  staff: ['branches.read', 'rooms.read'],
  teacher: ['branches.read', 'rooms.read'],
};

export const ROLE_NAMES: Record<OperationRole, string> = {
  admin: 'Admin',
  staff: 'Nhân viên',
  teacher: 'Giáo viên',
};

export const hasPermission = (role: OperationRole, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);
