import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as wishlistController from '../controllers/wishlist-controller.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(wishlistController.getWishlist));
router.post(
  '/:productId',
  validate(schemas.wishlistParams, 'params'),
  asyncHandler(wishlistController.addItem)
);
router.delete(
  '/:productId',
  validate(schemas.wishlistParams, 'params'),
  asyncHandler(wishlistController.removeItem)
);
router.delete('/', asyncHandler(wishlistController.clear));

export default router;
