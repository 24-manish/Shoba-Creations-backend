import { sendData } from '../http.js';
import * as wishlistService from '../services/wishlist-service.js';

export const getWishlist = async (req, res) => {
  sendData(res, { wishlist: await wishlistService.getWishlist(req.user.id) });
};

export const addItem = async (req, res) => {
  const wishlist = await wishlistService.addItem(req.user.id, req.params.productId);
  sendData(res, { wishlist });
};

export const removeItem = async (req, res) => {
  const wishlist = await wishlistService.removeItem(req.user.id, req.params.productId);
  sendData(res, { wishlist });
};

export const clear = async (req, res) => {
  sendData(res, { wishlist: await wishlistService.clear(req.user.id) });
};
