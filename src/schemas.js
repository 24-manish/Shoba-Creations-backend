import { z } from 'zod';

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(320);
const password = z.string().min(8).max(72);
const name = z.string().trim().min(2).max(120);
const phone = z.string().trim().max(32).nullable().optional();
const city = z.string().trim().max(120).nullable().optional();

const colorName = z.string().trim().min(1).max(60);
const sizeName = z.string().trim().min(1).max(20);
const colorOption = z.object({
  name: colorName,
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour such as #8B1E3F')
});

// Mirrors the products_tone_check constraint. The list was previously shorter
// than the constraint, so a product saved as 'plum' or 'ink' could be read back
// but then rejected with a 400 the moment an admin re-saved it.
const tone = z.enum(['burgundy', 'gold', 'emerald', 'ivory', 'plum', 'terracotta', 'ink']);

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};

const booleanish = (value) =>
  z.preprocess((input) => (input === undefined ? undefined : input === 'true' || input === true), z.boolean().optional());

// Declared outside the schemas object because both register and login reference
// it; inside the object literal it would be in its temporal dead zone at the
// point those two schemas are built.
//
// A guest cart posted at sign-in so its contents can be folded into the account.
const guestState = z.object({
  cart: z.array(
    z.object({
      productId: uuid,
      quantity: z.coerce.number().int().min(1).max(99),
      selectedColor: colorName.nullable().optional(),
      selectedSize: sizeName.nullable().optional()
    })
  ).max(100).optional(),
  wishlist: z.array(z.string().trim().min(1).max(200)).max(200).optional()
});

export const schemas = Object.freeze({
  register: z.object({
    name,
    email,
    password,
    phone,
    city,
    // A first-time shopper may already have a guest cart, so registration has to
    // accept the same guest state that sign-in does.
    guestState: guestState.optional()
  }),

  login: z.object({
    email,
    // Deliberately only a presence check: the 8-character minimum belongs to
    // registration, and rejecting short sign-in attempts here would leak that
    // the account exists.
    password: z.string().min(1).max(72),
    // Zod strips keys the schema does not declare, so this must be listed here
    // or a guest's cart and wishlist are silently discarded at sign-in.
    guestState: guestState.optional()
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password
  }),

  profileUpdate: z.object({
    name: name.optional(),
    phone,
    city
  }),

  // A guest cart posted at sign-in so its contents can be folded into the account.
  guestState,

  productQuery: z.object({
    category: z.string().trim().max(120).optional(),
    search: z.string().trim().max(120).optional(),
    minPrice: z.coerce.number().nonnegative().max(10000000).optional(),
    maxPrice: z.coerce.number().nonnegative().max(10000000).optional(),
    sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'name']).default('featured'),
    inStock: booleanish(),
    isFeatured: booleanish(),
    isNew: booleanish(),
    includeInactive: booleanish(),
    ...pagination
  }),

  slugParams: z.object({ slug: z.string().trim().min(1).max(200) }),
  // Every table uses a uuid primary key, including products, categories and
  // product images. Coercing to an integer here accepted "123" and then failed
  // against the uuid column, and rejected the real uuids the client actually has.
  idParams: z.object({ id: uuid }),
  imageParams: z.object({ id: uuid, imageId: uuid }),
  productIdParams: z.object({ productId: uuid }),

  cartLine: z.object({
    productId: uuid,
    quantity: z.coerce.number().int().min(1).max(99),
    selectedColor: colorName.nullable().optional(),
    selectedSize: sizeName.nullable().optional()
  }),

  cartQuote: z.object({
    shippingId: z.enum(['standard', 'express']).default('standard'),
    paymentMethod: z.enum(['upi', 'card', 'cod']).default('cod')
  }),

  // A line is identified by product plus variant; quantity 0 is how the client
  // asks for a removal, so it is allowed here and handled by the service.
  cartItemUpdate: z.object({
    productId: uuid,
    quantity: z.coerce.number().int().min(0).max(99),
    selectedColor: colorName.nullable().optional(),
    selectedSize: sizeName.nullable().optional()
  }),

  cartItemParams: z.object({
    productId: uuid,
    color: z.string().trim().max(60).optional(),
    size: z.string().trim().max(20).optional()
  }),

  wishlistParams: z.object({ productId: uuid }),

  orderCreate: z.object({
    shippingName: name,
    shippingEmail: email,
    // orders.shipping_phone is NOT NULL, so it has to be required here. Leaving it
    // optional let an order through validation and then fail on the constraint.
    shippingPhone: z.string().trim().min(6).max(32),
    shippingAddress: z.string().trim().min(5).max(2000),
    shippingCity: z.string().trim().max(120).optional(),
    shippingState: z.string().trim().max(120).optional(),
    shippingPincode: z.string().trim().max(20).optional(),
    shippingMethod: z.enum(['standard', 'express']).default('standard'),
    paymentMethod: z.enum(['upi', 'card', 'cod']).default('cod'),
    note: z.string().trim().max(1000).optional().nullable()
  }),

  orderQuery: z.object({
    status: z.enum(['processing', 'packed', 'shipped', 'delivered', 'cancelled']).optional(),
    channel: z.enum(['online_store', 'wholesale']).optional(),
    search: z.string().trim().max(120).optional(),
    ...pagination
  }),

  productCreate: z.object({
    name: z.string().trim().min(2).max(160),
    // SKUs are generated server-side on create, so admin clients cannot pick
    // their own.
    subcategory: z.string().trim().max(120).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    price: z.coerce.number().positive().max(10000000),
    compareAtPrice: z.coerce.number().positive().max(10000000).optional().nullable(),
    discountLabel: z.string().trim().max(40).optional().nullable(),
    rating: z.coerce.number().min(0).max(5).optional(),
    reviewCount: z.coerce.number().int().nonnegative().max(100000).optional(),
    stock: z.coerce.number().int().nonnegative().max(1000000),
    reorderPoint: z.coerce.number().int().nonnegative().max(100000).optional(),
    categoryId: uuid.nullable().optional(),
    categoryName: z.string().trim().max(120).optional(),
    colors: z.array(colorName).max(20).optional(),
    colorOptions: z.array(colorOption).max(20).optional(),
    sizes: z.array(sizeName).max(20).optional(),
    fabric: z.string().trim().max(120).optional(),
    occasion: z.string().trim().max(120).optional(),
    collection: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    artisan: z.string().trim().max(120).optional(),
    details: z.array(z.string().trim().max(500)).max(30).optional(),
    care: z.array(z.string().trim().max(500)).max(30).optional(),
    tone: tone.optional(),
    badge: z.string().trim().max(40).optional().nullable(),
    isNew: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional()
  }),

  productUpdate: z.object({
    name: z.string().trim().min(2).max(160).optional(),
    subcategory: z.string().trim().max(120).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    price: z.coerce.number().positive().max(10000000).optional(),
    compareAtPrice: z.coerce.number().positive().max(10000000).optional().nullable(),
    discountLabel: z.string().trim().max(40).optional().nullable(),
    rating: z.coerce.number().min(0).max(5).optional(),
    reviewCount: z.coerce.number().int().nonnegative().max(100000).optional(),
    stock: z.coerce.number().int().nonnegative().max(1000000).optional(),
    reorderPoint: z.coerce.number().int().nonnegative().max(100000).optional(),
    categoryId: uuid.nullable().optional(),
    categoryName: z.string().trim().max(120).optional(),
    colors: z.array(colorName).max(20).optional(),
    colorOptions: z.array(colorOption).max(20).optional(),
    sizes: z.array(sizeName).max(20).optional(),
    fabric: z.string().trim().max(120).optional(),
    occasion: z.string().trim().max(120).optional(),
    collection: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    artisan: z.string().trim().max(120).optional(),
    details: z.array(z.string().trim().max(500)).max(30).optional(),
    care: z.array(z.string().trim().max(500)).max(30).optional(),
    tone: tone.optional(),
    badge: z.string().trim().max(40).optional().nullable(),
    isNew: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional()
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one product field is required'
  }),

  imageReorder: z.object({
    imageIds: z.array(uuid).min(1).max(20)
  }),

  bulkProductIds: z.object({
    productIds: z.array(uuid).min(1).max(100)
  }),

  bulkProductPurge: z.object({
    productIds: z.array(uuid).min(1).max(100),
    force: z.boolean().optional()
  }),

  // A permanent delete is destructive on purpose, so it requires an explicit
  // force when order history still references the product.
  purgeQuery: z.object({
    force: booleanish()
  }),

  orderStatusUpdate: z.object({
    status: z.enum(['processing', 'packed', 'shipped', 'delivered', 'cancelled'])
  }),

  // The editorial lists are small and fixed, so they take a plain limit rather
  // than the paged shape: the storefront never asks for page 2 of a journal.
  contentQuery: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20)
  }),

  pagination: z.object(pagination)
});
