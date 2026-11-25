import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate';
import * as authController from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authController.login);
// refresh/logout authenticate with the httpOnly cookie, so they still work after the access token expires
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post(
  '/password',
  authenticate({ allowPendingPasswordChange: true }),
  authController.changePassword,
);
