import { getQuery, sendData } from '../http.js';
import * as productService from '../services/product-service.js';
import * as orderRepository from '../repositories/order-repository.js';

export const list = async (req, res) => {
  sendData(res, await productService.listPublic(getQuery(req)));
};

export const listAll = async (req, res) => {
  sendData(res, await productService.listAdmin(getQuery(req)));
};

export const getById = async (req, res) => {
  sendData(res, { product: await productService.getPublicById(req.params.id) });
};

export const getBySlug = async (req, res) => {
  const { product, related } = await productService.getPublicBySlug(req.params.slug);
  sendData(res, { product, related });
};

export const featured = async (req, res) => {
  const { items } = await productService.listPublic({ isFeatured: true, limit: 8 });
  sendData(res, { products: items });
};

export const create = async (req, res) => {
  const product = await productService.create(req.body);
  sendData(res, { product }, 201);
};

export const update = async (req, res) => {
  const product = await productService.update(req.params.id, req.body);
  sendData(res, { product });
};

export const archive = async (req, res) => {
  sendData(res, { product: await productService.deactivate(req.params.id) });
};

export const restore = async (req, res) => {
  sendData(res, { product: await productService.reactivate(req.params.id) });
};

export const uploadImages = async (req, res) => {
  const result = await productService.addImages(req.params.id, req.files ?? []);
  sendData(res, result, 201);
};

export const deleteImage = async (req, res) => {
  sendData(res, await productService.deleteImage(req.params.id, req.params.imageId));
};

export const reorderImages = async (req, res) => {
  const product = await productService.reorderImages(req.params.id, req.body.imageIds);
  sendData(res, { product });
};

export const lowStock = async (req, res) => {
  sendData(res, { products: await productService.lowStock({ limit: Number(getQuery(req).limit ?? 50) }) });
};

export const inventoryMovements = async (req, res) => {
  const productId = getQuery(req).productId ? Number(getQuery(req).productId) : null;
  sendData(res, { movements: await orderRepository.listInventoryMovements({ productId }) });
};
