import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as authController from '../controllers/auth-controller.js';

const router = Router();

router.post('/register', authRateLimiter, validate(schemas.register, 'body'), authController.register);
router.post('/login', authRateLimiter, validate(schemas.login, 'body'), authController.login);

// Re-issues the short-lived access cookie. The refresh cookie is httpOnly, so
// this is the only way for the client to recover after the access token lapses.
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/csrf', authController.csrfToken);

router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, validate(schemas.profileUpdate, 'body'), authController.updateProfile);
router.post(
  '/change-password',
  authenticate,
  authRateLimiter,
  validate(schemas.changePassword, 'body'),
  authController.changePassword
);
router.post('/logout-everywhere', authenticate, authController.logoutEverywhere);

export default router;
