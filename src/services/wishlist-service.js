import { AppError } from '../middleware/async-handler.js';
import * as productRepository from '../repositories/product-repository.js';
import * as wishlistRepository from '../repositories/wishlist-repository.js';

export const getWishlist = async (userId) => {
  const items = await wishlistRepository.list(userId);

  return {
    items,
    count: items.length,
    // Slug and product-id views so the client can match without probing.
    productIds: items.map((item) => item.id)
  };
};

export const addItem = async (userId, productId) => {
  // includeInactive: a wishlist is a "save for later" list, so a product that has
  // been delisted can still be saved. The stored row is returned with its
  // isActive and stock values so the client can explain why it cannot be bought.
  // The storefront lookup hides archived products by default, so the flag has to
  // be set explicitly here.
  const product = await productRepository.findById(productId, { includeInactive: true });

  if (!product) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  await wishlistRepository.add(userId, productId);
  return getWishlist(userId);
};

export const removeItem = async (userId, productId) => {
  const removed = await wishlistRepository.remove(userId, productId);

  if (!removed) {
    throw new AppError(404, 'That item is not in your wishlist', 'WISHLIST_ITEM_NOT_FOUND');
  }

  return getWishlist(userId);
};

export const clear = async (userId) => {
  await wishlistRepository.clear(userId);
  return { items: [], count: 0, productIds: [] };
};

export const mergeGuestWishlist = async ({ userId, guestProductIds }) => {
  await wishlistRepository.merge(userId, guestProductIds);
  return getWishlist(userId);
};

export const contains = (userId, productId) => wishlistRepository.has(userId, productId);
