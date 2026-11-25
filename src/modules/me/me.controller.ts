import type { RequestHandler } from 'express';

import { currentUser } from '../../middlewares/authenticate';
import * as meService from './me.service';

export const getMe: RequestHandler = async (req, res) => {
  res.json({ data: await meService.getMe(currentUser(req)) });
};
