import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { idempotency } from '../../middlewares/idempotency';
import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.use(authenticate(), authorize('users.manage'));

usersRouter.get('/', usersController.list);
usersRouter.post('/', idempotency, usersController.create);
usersRouter.patch('/:id', usersController.update);
usersRouter.get('/:id/branches', usersController.getBranches);
usersRouter.put('/:id/branches', usersController.setBranches);
usersRouter.post('/:id/reset-password', usersController.resetPassword);
