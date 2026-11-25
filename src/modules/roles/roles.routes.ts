import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import * as rolesController from './roles.controller';

export const rolesRouter = Router();

rolesRouter.get('/', authenticate(), authorize('users.manage'), rolesController.listRoles);
