import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFound } from './middlewares/error-handler';
import { requestLogger } from './middlewares/request-logger';
import { router } from './routes';

export const app = express();

app.use(requestLogger);
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/v1', router);

app.use(notFound);
app.use(errorHandler);
