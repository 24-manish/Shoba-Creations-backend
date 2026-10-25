import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as cartController from '../controllers/cart-controller.js';

const router = Router();

// The cart lives server-side for signed-in shoppers; a guest cart is held in the
// browser and merged in at sign-in.
router.use(authenticate);

router.get('/', asyncHandler(cartController.getCart));
router.post('/items', validate(schemas.cartLine, 'body'), asyncHandler(cartController.addItem));
router.patch('/items', validate(schemas.cartItemUpdate, 'body'), asyncHandler(cartController.updateItem));
router.delete(
  '/items/:productId',
  validate(schemas.cartItemParams, 'params'),
  asyncHandler(cartController.removeItem)
);
router.delete('/', asyncHandler(cartController.clear));

export default router;
