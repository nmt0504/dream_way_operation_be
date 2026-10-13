import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFound } from './middlewares/error-handler';
import { router } from './routes';

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use('/api/v1', router);

app.use(notFound);
app.use(errorHandler);
