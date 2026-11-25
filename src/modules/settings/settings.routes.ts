import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import * as settingsController from './settings.controller';

export const settingsRouter = Router();

settingsRouter.use(authenticate(), authorize('settings.manage'));

settingsRouter.get('/', settingsController.get);
settingsRouter.patch('/', settingsController.update);
