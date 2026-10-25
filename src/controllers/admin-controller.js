import { getQuery, sendData } from '../http.js';
import * as categoryService from '../services/category-service.js';
import * as orderService from '../services/order-service.js';
import * as productService from '../services/product-service.js';
import * as userRepository from '../repositories/user-repository.js';

export const dashboard = async (req, res) => {
  sendData(res, await orderService.dashboard());
};

export const listProducts = async (req, res) => {
  sendData(res, await productService.listAdmin(getQuery(req)));
};

export const createProduct = async (req, res) => {
  sendData(res, { product: await productService.create(req.body) }, 201);
};

export const updateProduct = async (req, res) => {
  sendData(res, { product: await productService.update(req.params.id, req.body) });
};

export const archiveProduct = async (req, res) => {
  sendData(res, { product: await productService.deactivate(req.params.id) });
};

export const archiveProducts = async (req, res) => {
  sendData(res, { productIds: await productService.archiveMany(req.body.productIds) });
};

export const restoreProducts = async (req, res) => {
  sendData(res, { productIds: await productService.restoreMany(req.body.productIds) });
};

export const restoreProduct = async (req, res) => {
  sendData(res, { product: await productService.reactivate(req.params.id) });
};

export const purgeProduct = async (req, res) => {
  sendData(res, { product: await productService.purgeProduct(req.params.id, { force: getQuery(req).force }) });
};

export const purgeProducts = async (req, res) => {
  sendData(res, { products: await productService.purgeMany(req.body.productIds, { force: req.body.force }) });
};

export const uploadImages = async (req, res) => {
  sendData(res, { product: await productService.addImages(req.params.id, req.files ?? []) }, 201);
};

export const deleteImage = async (req, res) => {
  sendData(res, { product: await productService.deleteImage(req.params.id, req.params.imageId) });
};

export const reorderImages = async (req, res) => {
  sendData(res, { product: await productService.reorderImages(req.params.id, req.body.imageIds) });
};

export const listCategories = async (req, res) => {
  sendData(res, { categories: await categoryService.list() });
};

export const createCategory = async (req, res) => {
  sendData(res, { category: await categoryService.create(req.body) }, 201);
};

export const updateCategory = async (req, res) => {
  sendData(res, { category: await categoryService.update(req.params.id, req.body) });
};

export const deleteCategory = async (req, res) => {
  sendData(res, { category: await categoryService.remove(req.params.id) });
};

export const listOrders = async (req, res) => {
  const { items, pagination } = await orderService.listAll(getQuery(req));

  // Same envelope as GET /api/orders so the admin table and the customer
  // history read one shape rather than orders vs items.
  sendData(res, { orders: items, pagination });
};

export const getOrder = async (req, res) => {
  const order = await orderService.getAny(req.params.orderNumber);
  sendData(res, {
    order,
    availableTransitions: orderService.availableTransitions(order.status)
  });
};

export const updateOrderStatus = async (req, res) => {
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

export const listUsers = async (req, res) => {
  sendData(res, { users: await userRepository.list() });
};

export const lowStock = async (req, res) => {
  sendData(res, { products: await productService.lowStock({ limit: Number(getQuery(req).limit ?? 50) }) });
};
