import type { RequestHandler } from 'express';

import { OPERATION_ROLES, ROLE_NAMES, ROLE_PERMISSIONS } from '../../lib/permissions';

export const listRoles: RequestHandler = (_req, res) => {
  res.json({
    data: OPERATION_ROLES.map((code) => ({
      code,
      name: ROLE_NAMES[code],
      permissions: ROLE_PERMISSIONS[code],
    })),
  });
};
