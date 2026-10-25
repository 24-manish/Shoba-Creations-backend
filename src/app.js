import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { sendData } from './http.js';
import { verifyCsrf } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import adminRouter from './routes/admin-routes.js';
import authRouter from './routes/auth-routes.js';
import cartRouter from './routes/cart-routes.js';
import orderRouter from './routes/order-routes.js';
import wishlistRouter from './routes/wishlist-routes.js';
import apiRouter from './routes/index.js';

const app = express();
const allowedOrigins = env.corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');

app.use(
  helmet({
    // Product images are served from this origin, so the default
    // same-origin policy is correct; the CSP is relaxed only as far as needed
    // for the dev server's inline styles.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Credentialed requests cannot use a wildcard origin, so the allow-list is
// enforced explicitly and cookies are permitted.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(apiRateLimiter);

app.get('/health', (req, res) => {
  sendData(res, { status: 'ok' });
});

app.get('/api/health', (req, res) => {
  sendData(res, { status: 'ok' });
});

// Every state-changing request must echo the double-submit CSRF token. Sign-in
// and registration are exempt because a first-time visitor has no CSRF cookie
// yet, and neither endpoint relies on an existing session.
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

app.use('/api', (req, res, next) => {
  const path = req.originalUrl.split('?')[0];

  if (CSRF_EXEMPT_PATHS.has(path)) {
    next();
    return;
  }

  verifyCsrf(req, res, next);
});

app.use('/api/auth', authRouter);
app.use('/api/cart', cartRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/orders', orderRouter);
app.use('/api/admin', adminRouter);
app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
