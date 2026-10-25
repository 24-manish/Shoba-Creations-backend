import { csrfCookieName } from '../config/env.js';
import { AppError } from './async-handler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie check. The token lives in a readable cookie and must be
// echoed in a header, which a cross-origin page cannot do. Combined with
// sameSite=lax on the session cookies, this blocks cross-site state changes.
export const verifyCsrf = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[csrfCookieName];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new AppError(403, 'The security token is missing or invalid', 'CSRF_TOKEN_INVALID'));
    return;
  }

  next();
};
