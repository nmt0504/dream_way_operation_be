import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import * as meController from './me.controller';

export const meRouter = Router();

meRouter.get('/', authenticate({ allowPendingPasswordChange: true }), meController.getMe);
