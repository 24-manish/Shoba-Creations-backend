import { env } from '../config/env.js';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/async-handler.js';
import * as cartRepository from '../repositories/cart-repository.js';

const MAX_QUANTITY_PER_LINE = 10;

export const shippingOptions = (subtotal) => [
  {
    id: 'standard',
    label: 'Standard delivery',
    description: '3-5 business days',
    cost: subtotal >= env.freeShippingThreshold || subtotal === 0 ? 0 : env.standardShippingCost
  },
  {
    id: 'express',
    label: 'Express delivery',
    description: '1-2 business days',
    cost: env.expressShippingCost
  }
];

// Priced server-side so the client can never present an amount the API will
// not honour. Only cash on delivery carries an extra handling fee; upi and card
// are collected up front and cost the customer nothing to receive.
export const priceCart = ({ items, shippingId = 'standard', paymentMethod = 'cod' }) => {
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const options = shippingOptions(subtotal);
  const shipping = options.find((option) => option.id === shippingId) ?? options[0];
  const handlingFee = paymentMethod === 'cod' && subtotal > 0 ? env.codHandlingFee : 0;

  return {
    subtotal,
    shippingId: shipping.id,
    shippingLabel: shipping.label,
    shippingCost: shipping.cost,
    handlingFee,
    total: Number((subtotal + shipping.cost + handlingFee).toFixed(2)),
    freeShippingThreshold: env.freeShippingThreshold,
    amountToFreeShipping: Math.max(0, env.freeShippingThreshold - subtotal),
    codAvailable: true
  };
};

// Cash on delivery is collected after dispatch, so the order is not settled when
// it is placed. The electronic methods are settled at checkout.
export const paymentStatusFor = (paymentMethod) => (paymentMethod === 'cod' ? 'pending' : 'paid');

export const getCart = async (userId, options, db) => {
  // The caller must pass its transaction handle when it already holds one:
  // getCart re-runs ensureCart, whose ON CONFLICT DO UPDATE takes a row lock on
  // the cart. Reading through a second pooled connection would block on the lock
  // that the open transaction is already holding.
  const cart = await cartRepository.getCart(userId, db);
  return { ...cart, ...priceCart({ items: cart.items, ...options }) };
};

const assertStock = (product, nextQuantity) => {
  if (!product || !product.isActive) {
    throw new AppError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
  }

  if (nextQuantity > product.stock) {
    throw new AppError(
      409,
      product.stock === 0
        ? 'This item is out of stock'
        : `Only ${product.stock} of this item are available`,
      'INSUFFICIENT_STOCK'
    );
  }

  if (nextQuantity > MAX_QUANTITY_PER_LINE) {
    throw new AppError(
      400,
      `A maximum of ${MAX_QUANTITY_PER_LINE} can be purchased per item`,
      'QUANTITY_LIMIT_EXCEEDED'
    );
  }
};

export const addItem = async (userId, { productId, quantity = 1, selectedColor = null, selectedSize = null }) =>
  withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);
    const product = await cartRepository.getProductForUpdate(productId, client);
    const current = await cartRepository.getItem(cartId, productId, selectedColor, selectedSize, client);

    assertStock(product, (current?.quantity ?? 0) + quantity);

    await cartRepository.addOrIncrement(cartId, productId, quantity, selectedColor, selectedSize, client);
    return getCart(userId, undefined, client);
  });

export const updateItem = async (userId, { productId, quantity, selectedColor = null, selectedSize = null }) =>
  withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);

    if (quantity <= 0) {
      await cartRepository.remove(cartId, productId, selectedColor, selectedSize, client);
      return getCart(userId, undefined, client);
    }

    const product = await cartRepository.getProductForUpdate(productId, client);
    assertStock(product, quantity);

    const existing = await cartRepository.getItem(cartId, productId, selectedColor, selectedSize, client);

    if (!existing) {
      throw new AppError(404, 'That item is not in your cart', 'CART_ITEM_NOT_FOUND');
    }

    await cartRepository.updateQuantity(cartId, productId, quantity, selectedColor, selectedSize, client);
    return getCart(userId, undefined, client);
  });

export const removeItem = async (userId, { productId, selectedColor = null, selectedSize = null }) =>
  withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);
    const removed = await cartRepository.remove(cartId, productId, selectedColor, selectedSize, client);

    if (!removed) {
      throw new AppError(404, 'That item is not in your cart', 'CART_ITEM_NOT_FOUND');
    }

    return getCart(userId, undefined, client);
  });

export const clearCart = async (userId) =>
  withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);
    await cartRepository.clear(cartId, client);
    return getCart(userId, undefined, client);
  });

/**
 * Merges a guest's local cart into the account after sign-in. Quantities are
 * summed per product and variant, then clamped to available stock so a guest
 * cart built against stale stock data cannot overflow the server cart.
 */
export const mergeGuestCart = async ({ userId, guestCart }) => {
  const lines = Array.isArray(guestCart) ? guestCart : [];

  if (lines.length === 0) {
    return getCart(userId);
  }

  return withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);

    for (const line of lines) {
      const product = await cartRepository.getProductForUpdate(line.productId, client);

      if (!product || !product.isActive) {
        continue;
      }

      const existing = await cartRepository.getItem(
        cartId,
        line.productId,
        line.selectedColor,
        line.selectedSize,
        client
      );

      const desired = (existing?.quantity ?? 0) + Math.max(1, Math.trunc(line.quantity ?? 1));
      const allowed = Math.max(0, Math.min(desired, product.stock, MAX_QUANTITY_PER_LINE));

      if (allowed === 0) {
        continue;
      }

      if (existing) {
        await cartRepository.updateQuantity(
          cartId,
          line.productId,
          allowed,
          line.selectedColor,
          line.selectedSize,
          client
        );
      } else {
        await cartRepository.addOrIncrement(
          cartId,
          line.productId,
          allowed,
          line.selectedColor,
          line.selectedSize,
          client
        );
      }
    }

    return getCart(userId, undefined, client);
  });
};
