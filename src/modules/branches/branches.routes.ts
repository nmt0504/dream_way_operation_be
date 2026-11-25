import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { idempotency } from '../../middlewares/idempotency';
import * as branchesController from './branches.controller';

export const branchesRouter = Router();

branchesRouter.use(authenticate());

branchesRouter.get('/', authorize('branches.read'), branchesController.list);
branchesRouter.post('/', authorize('branches.manage'), idempotency, branchesController.create);
branchesRouter.patch('/:id', authorize('branches.manage'), branchesController.update);
