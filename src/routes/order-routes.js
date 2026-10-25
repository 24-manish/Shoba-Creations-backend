import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as orderController from '../controllers/order-controller.js';

const router = Router();

router.use(authenticate);

router.post('/', validate(schemas.orderCreate, 'body'), asyncHandler(orderController.checkout));
router.get('/', validate(schemas.orderQuery, 'query'), asyncHandler(orderController.listMine));
router.get('/:orderNumber', asyncHandler(orderController.getMine));
router.post('/:orderNumber/cancel', asyncHandler(orderController.cancelMine));

export default router;
