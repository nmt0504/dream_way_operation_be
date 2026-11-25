const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtAccessSecret =
  process.env.JWT_ACCESS_SECRET ||
  (isProduction ? undefined : 'dev-only-jwt-secret-do-not-use-in-prod');
if (!jwtAccessSecret) throw new Error('JWT_ACCESS_SECRET is required in production');

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  // must be an explicit origin (not *) for the browser to send the refresh-token cookie
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl,
  logLevel: process.env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info'),
  jwtAccessSecret,
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
};
