import { getQuery, sendData } from '../http.js';
import * as orderService from '../services/order-service.js';

export const checkout = async (req, res) => {
  const order = await orderService.checkout({ userId: req.user.id, payload: req.body });
  sendData(res, { order }, 201);
};

export const listMine = async (req, res) => {
  const { items, pagination } = await orderService.listForUser(req.user.id, getQuery(req));
  sendData(res, { orders: items, pagination });
};

export const getMine = async (req, res) => {
  const order = await orderService.getForUser(req.user.id, req.params.orderNumber);
  sendData(res, { order });
};

export const cancelMine = async (req, res) => {
  const order = await orderService.cancelForUser({
    userId: req.user.id,
    orderNumber: req.params.orderNumber
  });

  sendData(res, { order });
};

export const listAll = async (req, res) => {
  const { items, pagination } = await orderService.listAll(getQuery(req));
  sendData(res, { orders: items, pagination });
};

export const getOne = async (req, res) => {
  const order = await orderService.getAny(req.params.orderNumber);
  sendData(res, {
    order,
    availableTransitions: orderService.availableTransitions(order.status)
  });
};

export const updateStatus = async (req, res) => {
  const order = await orderService.updateStatus({
    orderNumber: req.params.orderNumber,
    status: req.body.status,
    userId: req.user.id
  });

  sendData(res, {
    order,
    availableTransitions: orderService.availableTransitions(order.status)
  });
};
