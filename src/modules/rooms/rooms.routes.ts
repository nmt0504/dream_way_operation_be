import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { idempotency } from '../../middlewares/idempotency';
import * as roomsController from './rooms.controller';

export const roomsRouter = Router();

roomsRouter.use(authenticate());

roomsRouter.get('/', authorize('rooms.read'), roomsController.list);
roomsRouter.post('/', authorize('rooms.manage'), idempotency, roomsController.create);
roomsRouter.patch('/:id', authorize('rooms.manage'), roomsController.update);
