import 'dotenv/config';

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
};

const parseInteger = (value, fallback) => {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

// `__Host-` prefixed cookie names require the Secure attribute, which browsers
// reject over plain http://localhost. They are enabled for production only.
const cookiePrefix = process.env.NODE_ENV === 'production' ? '__Host-' : '';

export const env = Object.freeze({
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: parseBoolean(process.env.DATABASE_SSL),
  databaseSchema: process.env.DATABASE_SCHEMA ?? 'public',
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL,
  adminName: process.env.ADMIN_NAME ?? 'Administrator',
  adminPassword: process.env.ADMIN_PASSWORD,
  cookiePrefix,
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtlDays: parseInteger(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  uploadMaxBytes: parseInteger(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
  uploadMaxFiles: parseInteger(process.env.UPLOAD_MAX_FILES, 6),
  freeShippingThreshold: parseInteger(process.env.FREE_SHIPPING_THRESHOLD, 9999),
  standardShippingCost: parseInteger(process.env.STANDARD_SHIPPING_COST, 299),
  expressShippingCost: parseInteger(process.env.EXPRESS_SHIPPING_COST, 599),
  codHandlingFee: parseInteger(process.env.COD_HANDLING_FEE, 50)
});

export const accessCookieName = `${env.cookiePrefix}sc_at`;
export const refreshCookieName = `${env.cookiePrefix}sc_rt`;
export const csrfCookieName = `${env.cookiePrefix}sc_csrf`;

export const assertServerConfig = () => {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  if (!/^[a-z_][a-z0-9_]*$/.test(env.databaseSchema)) {
    throw new Error('DATABASE_SCHEMA must be a valid PostgreSQL identifier');
  }
};
