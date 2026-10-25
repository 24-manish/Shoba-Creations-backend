import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadProductImages } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as adminController from '../controllers/admin-controller.js';

const router = Router();

// authenticate must come first: requireRole reads req.user, which only the
// authentication middleware populates. Without it every admin request is
// rejected as an anonymous caller.
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', asyncHandler(adminController.dashboard));

router.get('/products', validate(schemas.productQuery, 'query'), asyncHandler(adminController.listProducts));
router.post('/products', validate(schemas.productCreate, 'body'), asyncHandler(adminController.createProduct));
router.patch('/products/:id', validate(schemas.idParams, 'params'), validate(schemas.productUpdate, 'body'), asyncHandler(adminController.updateProduct));
router.delete('/products/:id', validate(schemas.idParams, 'params'), asyncHandler(adminController.archiveProduct));
router.post('/products/:id/restore', validate(schemas.idParams, 'params'), asyncHandler(adminController.restoreProduct));
router.delete('/products/:id/permanent', validate(schemas.idParams, 'params'), validate(schemas.purgeQuery, 'query'), asyncHandler(adminController.purgeProduct));

// Bulk mutations answer with the affected ids so the admin table can reconcile
// its selection without re-fetching the whole catalogue first.
router.post('/products/bulk-archive', validate(schemas.bulkProductIds, 'body'), asyncHandler(adminController.archiveProducts));
router.post('/products/bulk-restore', validate(schemas.bulkProductIds, 'body'), asyncHandler(adminController.restoreProducts));
router.post('/products/bulk-purge', validate(schemas.bulkProductPurge, 'body'), asyncHandler(adminController.purgeProducts));

// multipart is handled before body validation because multer consumes the
// stream; no other parser may read this route's body first.
router.post(
  '/products/:id/images',
  validate(schemas.idParams, 'params'),
  uploadProductImages,
  asyncHandler(adminController.uploadImages)
);
router.delete(
  '/products/:id/images/:imageId',
  validate(schemas.imageParams, 'params'),
  asyncHandler(adminController.deleteImage)
);
router.put(
  '/products/:id/images',
  validate(schemas.idParams, 'params'),
  validate(schemas.imageReorder, 'body'),
  asyncHandler(adminController.reorderImages)
);

router.get('/categories', asyncHandler(adminController.listCategories));
router.post('/categories', asyncHandler(adminController.createCategory));
router.patch('/categories/:id', validate(schemas.idParams, 'params'), asyncHandler(adminController.updateCategory));
router.delete('/categories/:id', validate(schemas.idParams, 'params'), asyncHandler(adminController.deleteCategory));

router.get('/orders', validate(schemas.orderQuery, 'query'), asyncHandler(adminController.listOrders));
router.get('/orders/:orderNumber', asyncHandler(adminController.getOrder));
router.patch(
  '/orders/:orderNumber/status',
  validate(schemas.orderStatusUpdate, 'body'),
  asyncHandler(adminController.updateOrderStatus)
);

router.get('/users', asyncHandler(adminController.listUsers));
router.get('/low-stock', asyncHandler(adminController.lowStock));

export default router;
