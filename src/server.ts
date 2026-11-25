import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

app.listen(env.port, () => {
  logger.info(`Server listening on http://localhost:${env.port}`);
});
