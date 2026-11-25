import pino from 'pino';

import { env } from './env';

export const logger = pino({
  level: env.logLevel,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.nodeEnv === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  }),
});
