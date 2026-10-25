import { getQuery, sendData } from '../http.js';
import * as cartService from '../services/cart-service.js';

export const getCart = async (req, res) => {
  const cart = await cartService.getCart(req.user.id, {
    shippingId: getQuery(req).shippingId,
    paymentMethod: getQuery(req).paymentMethod
  });

  sendData(res, { cart, shippingOptions: cartService.shippingOptions(cart.subtotal) });
};

export const addItem = async (req, res) => {
  const cart = await cartService.addItem(req.user.id, req.body);
  sendData(res, { cart, shippingOptions: cartService.shippingOptions(cart.subtotal) });
};

export const updateItem = async (req, res) => {
  const cart = await cartService.updateItem(req.user.id, req.body);
  sendData(res, { cart, shippingOptions: cartService.shippingOptions(cart.subtotal) });
};

export const removeItem = async (req, res) => {
  const cart = await cartService.removeItem(req.user.id, {
    productId: req.params.productId,
    selectedColor: getQuery(req).color ?? null,
    selectedSize: getQuery(req).size ?? null
  });

  sendData(res, { cart, shippingOptions: cartService.shippingOptions(cart.subtotal) });
};

export const clear = async (req, res) => {
  const cart = await cartService.clearCart(req.user.id);
  sendData(res, { cart, shippingOptions: cartService.shippingOptions(cart.subtotal) });
};
