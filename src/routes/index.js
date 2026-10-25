import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { optionalAuthenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../schemas.js';
import * as categoryController from '../controllers/category-controller.js';
import * as editorialController from '../controllers/editorial-controller.js';
import * as productController from '../controllers/product-controller.js';

const router = Router();

router.get('/categories', asyncHandler(categoryController.list));

// Optional authentication lets a signed-in shopper see their wishlist state
// alongside the catalogue without the endpoint becoming private.
router.get('/products', optionalAuthenticate, validate(schemas.productQuery, 'query'), asyncHandler(productController.list));
router.get('/products/featured', asyncHandler(productController.featured));
router.get('/products/:slug', validate(schemas.slugParams, 'params'), asyncHandler(productController.getBySlug));

// Editorial content lives in the database like everything else, so the homepage
// no longer bundles its own copy. The aggregate endpoint exists so the homepage
// renders in one round trip instead of four.
router.get('/content/home', asyncHandler(editorialController.getHomepageContent));
router.get('/content/stories', validate(schemas.contentQuery, 'query'), asyncHandler(editorialController.listStories));
router.get('/content/stories/:slug', validate(schemas.slugParams, 'params'), asyncHandler(editorialController.getStory));
router.get('/content/testimonials', validate(schemas.contentQuery, 'query'), asyncHandler(editorialController.listTestimonials));
router.get('/content/images', asyncHandler(editorialController.listSiteImages));

export default router;
