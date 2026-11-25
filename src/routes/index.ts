import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.routes';
import { branchesRouter } from '../modules/branches/branches.routes';
import { meRouter } from '../modules/me/me.routes';
import { rolesRouter } from '../modules/roles/roles.routes';
import { roomsRouter } from '../modules/rooms/rooms.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { usersRouter } from '../modules/users/users.routes';
import { healthRouter } from './health.route';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/me', meRouter);
router.use('/roles', rolesRouter);
router.use('/users', usersRouter);
router.use('/settings', settingsRouter);
router.use('/branches', branchesRouter);
router.use('/rooms', roomsRouter);
