import { Router } from 'express';
import { healthRouter } from './health.route';

export const router = Router();

router.use('/health', healthRouter);
