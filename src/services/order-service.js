import { query, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/async-handler.js';
import * as cartRepository from '../repositories/cart-repository.js';
import * as orderRepository from '../repositories/order-repository.js';
import { paymentStatusFor, priceCart } from './cart-service.js';

export const STATUSES = ['processing', 'packed', 'shipped', 'delivered', 'cancelled'];

// Orders move forward one stage at a time, and may only be cancelled while the
// goods are still in the warehouse. Returning a cancelled order to processing is
// allowed so a mistaken cancellation can be undone.
const TRANSITIONS = {
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: ['processing']
};

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

export const listForUser = (userId, options) => orderRepository.listForUser(userId, options);

export const listAll = (options) => orderRepository.list(options);

export const getForUser = async (userId, orderNumber) => {
  const order = await orderRepository.findByNumber(orderNumber);

  if (!order) {
    throw new AppError(404, 'Order was not found', 'ORDER_NOT_FOUND');
  }

  if (order.userId !== userId) {
    throw new AppError(404, 'Order was not found', 'ORDER_NOT_FOUND');
  }

  return order;
};

export const getAny = async (orderNumber) => {
  const order = await orderRepository.findByNumber(orderNumber);

  if (!order) {
    throw new AppError(404, 'Order was not found', 'ORDER_NOT_FOUND');
  }

  return order;
};

/**
 * Converts the signed-in user's cart into an order.
 *
 * Prices are recalculated from the database rather than trusted from the
 * request, and stock is decremented with a guarded UPDATE inside the same
 * transaction, so two customers checking out the last unit cannot both succeed.
 */
export const checkout = async ({ userId, payload }) =>
  withTransaction(async (client) => {
    const cartId = await cartRepository.ensureCart(userId, client);
    const items = await cartRepository.getItems(cartId, client);

    if (items.length === 0) {
      throw new AppError(400, 'Your cart is empty', 'CART_EMPTY');
    }

    const priced = [];

    for (const item of items) {
      const product = await orderRepository.lockProductForUpdate(item.productId, client);

      if (!product || !product.isActive) {
        throw new AppError(409, `${item.name} is no longer available`, 'PRODUCT_UNAVAILABLE');
      }

      if (product.stock < item.quantity) {
        throw new AppError(
          409,
          product.stock === 0
            ? `${item.name} has just sold out`
            : `Only ${product.stock} of ${item.name} remain`,
          'INSUFFICIENT_STOCK'
        );
      }

      const imageUrl = await orderRepository.findProductImage(item.productId, client);
      const lineTotal = Number((product.price * item.quantity).toFixed(2));

      priced.push({
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal,
        imageUrl,
        // Captured while the row is locked, for the inventory audit trail.
        previousStock: product.stock
      });
    }

    const totals = priceCart({
      items: priced,
      shippingId: payload.shippingMethod,
      paymentMethod: payload.paymentMethod
    });

    const order = await orderRepository.insert(
      {
        userId,
        channel: 'online_store',
        status: 'processing',
        shipping: {
          name: payload.shippingName,
          email: payload.shippingEmail,
          phone: payload.shippingPhone ?? null,
          address: payload.shippingAddress,
          city: payload.shippingCity ?? null,
          state: payload.shippingState ?? null,
          pincode: payload.shippingPincode ?? null
        },
        shippingMethod: payload.shippingMethod,
        paymentMethod: payload.paymentMethod,
        paymentStatus: paymentStatusFor(payload.paymentMethod),
        note: payload.note ?? null,
        items: priced,
        totals
      },
      client
    );

    for (const item of priced) {
      const decremented = await orderRepository.decrementStock(item.productId, item.quantity, client);

      if (!decremented) {
        throw new AppError(409, `${item.productName} just sold out`, 'INSUFFICIENT_STOCK');
      }

      await orderRepository.recordInventoryMovement(
        {
          productId: item.productId,
          orderId: order.id,
          actorId: userId,
          delta: -item.quantity,
          previousStock: item.previousStock,
          resultingStock: decremented.stock,
          reason: 'sale',
          note: order.orderNumber
        },
        client
      );
    }

    await cartRepository.clear(cartId, client);

    return order;
  });

export const updateStatus = async ({ orderNumber, status, userId }) =>
  withTransaction(async (client) => {
    const order = await orderRepository.findByNumber(orderNumber, client);

    if (!order) {
      throw new AppError(404, 'Order was not found', 'ORDER_NOT_FOUND');
    }

    if (order.status === status) {
      return order;
    }

    if (!canTransition(order.status, status)) {
      throw new AppError(
        409,
        `An order that is ${order.status} cannot be marked as ${status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Cancelling releases the reserved units; returning to processing re-reserves
    // them. Any other transition leaves stock untouched.
    if (status === 'cancelled') {
      for (const item of order.items) {
        if (item.productId === null) {
          continue;
        }

        const restored = await orderRepository.restoreStock(item.productId, item.quantity, client);

        await orderRepository.recordInventoryMovement(
          {
            productId: item.productId,
            orderId: order.id,
            actorId: userId,
            delta: item.quantity,
            previousStock: restored.stock - item.quantity,
            resultingStock: restored.stock,
            reason: 'cancellation',
            note: order.orderNumber
          },
          client
        );
      }
    }

    if (order.status === 'cancelled' && status === 'processing') {
      for (const item of order.items) {
        if (item.productId === null) {
          continue;
        }

        const before = await orderRepository.lockProductForUpdate(item.productId, client);
        const decremented = await orderRepository.decrementStock(item.productId, item.quantity, client);

        if (!decremented) {
          throw new AppError(409, `Not enough ${item.productName} to reinstate this order`, 'INSUFFICIENT_STOCK');
        }

        await orderRepository.recordInventoryMovement(
          {
            productId: item.productId,
            orderId: order.id,
            actorId: userId,
            delta: -item.quantity,
            previousStock: before.stock,
            resultingStock: decremented.stock,
            reason: 'reinstatement',
            note: order.orderNumber
          },
          client
        );
      }
    }

    return orderRepository.setStatus(order.id, status, client);
  });

export const cancelForUser = async ({ userId, orderNumber }) => {
  const order = await getForUser(userId, orderNumber);

  if (order.status === 'cancelled') {
    return order;
  }

  if (!canTransition(order.status, 'cancelled')) {
    throw new AppError(
      409,
      `An order that has already been ${order.status} can no longer be cancelled`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  return updateStatus({ orderNumber, status: 'cancelled', userId });
};

export const availableTransitions = (status) => TRANSITIONS[status] ?? [];

export const dashboard = async () => {
  const [summary, statusCounts, revenue, recent, lowStock, bestSellers] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS "totalOrders",
         COUNT(*) FILTER (WHERE status = 'processing')::int AS "awaitingFulfilment",
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledOrders",
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS "ordersThisMonth",
         COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::float8 AS "revenueLifetime",
         COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('month', NOW())), 0)::float8 AS "revenueThisMonth",
         COALESCE(AVG(total) FILTER (WHERE status <> 'cancelled'), 0)::float8 AS "averageOrderValue"
       FROM orders`
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status ORDER BY status`
    ),
    query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(total), 0)::float8 AS revenue,
              COUNT(*)::int AS orders
       FROM orders
       WHERE status <> 'cancelled' AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1`
    ),
    query(
      `SELECT o.id, o.order_number AS "orderNumber", o.status, o.total::float8 AS total,
              o.item_count AS "itemCount", o.created_at AS "createdAt",
              o.shipping_name AS "shippingName"
       FROM orders o
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 5`
    ),
    query(
      `SELECT id, name, slug, sku, stock, reorder_point AS "reorderPoint"
       FROM products
       WHERE is_active = TRUE AND stock <= reorder_point
       ORDER BY stock ASC, name ASC
       LIMIT 8`
    ),
    query(
      `SELECT oi.product_id AS "productId", oi.product_name AS "productName", oi.product_slug AS "productSlug",
              SUM(oi.quantity)::int AS "unitsSold", SUM(oi.line_total)::float8 AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'cancelled'
       GROUP BY oi.product_id, oi.product_name, oi.product_slug
       ORDER BY "unitsSold" DESC, revenue DESC
       LIMIT 5`
    )
  ]);

  return {
    ...summary.rows[0],
    statusCounts: Object.fromEntries(statusCounts.rows.map((row) => [row.status, row.count])),
    revenueByDay: revenue.rows,
    recentOrders: recent.rows,
    lowStock: lowStock.rows,
    // Every other aggregate unwraps .rows; returning the raw driver result here
    // shipped a pg Result object to the client instead of a list of products.
    bestSellers: bestSellers.rows
  };
};
