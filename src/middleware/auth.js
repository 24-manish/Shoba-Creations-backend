import { AppError } from './async-handler.js';
import * as sessionService from '../services/session-service.js';

const resolveSession = (req) => {
  const { accessToken } = sessionService.readSessionCookies(req);

  if (!accessToken) {
    return null;
  }

  try {
    const payload = sessionService.verifyAccessToken(accessToken);
    return { id: payload.sub, role: payload.role, email: payload.email };
  } catch {
    return null;
  }
};

export const authenticate = (req, res, next) => {
  const user = resolveSession(req);

  if (!user) {
    next(new AppError(401, 'Please sign in to continue', 'AUTHENTICATION_REQUIRED'));
    return;
  }

  req.user = user;
  next();
};

// Attaches the session when one is present but never rejects the request, so
// public endpoints can personalise their response without requiring sign-in.
export const optionalAuthenticate = (req, res, next) => {
  req.user = resolveSession(req);
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
    return;
  }

  next();
};
