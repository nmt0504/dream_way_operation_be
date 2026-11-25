import type { RequestHandler } from 'express';

import { AppError } from '../lib/app-error';
import { type Permission, hasPermission } from '../lib/permissions';
import { currentUser } from './authenticate';

export const authorize =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!hasPermission(currentUser(req).role, permission)) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
    }
    next();
  };
