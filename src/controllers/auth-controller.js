import { sendData } from '../http.js';
import { issueCsrfToken } from '../services/session-service.js';
import * as authService from '../services/auth-service.js';
import * as wishlistService from '../services/wishlist-service.js';

export const register = async (req, res) => {
  const user = await authService.register(req.body);
  const session = await authService.startSession(authService.toPublicUser(user), {
    req,
    res,
    mergeGuestState: req.body.guestState ?? null
  });

  sendData(
    res,
    { user: session.user, cart: session.cart, wishlist: session.wishlist },
    201
  );
};

export const login = async (req, res) => {
  const user = await authService.authenticate(req.body);
  // A guest cart and wishlist posted alongside the credentials are merged, so
  // signing in never discards anything the shopper had already chosen.
  const session = await authService.startSession(user, {
    req,
    res,
    mergeGuestState: req.body.guestState ?? null
  });

  sendData(res, { user: session.user, cart: session.cart, wishlist: session.wishlist });
};

export const refresh = async (req, res) => {
  const user = await authService.refresh({ req, res });
  sendData(res, { user });
};

export const logout = async (req, res) => {
  await authService.endSession({ req, res });
  sendData(res, { signedOut: true });
};

export const logoutEverywhere = async (req, res) => {
  await authService.signOutEverywhere({ userId: req.user.id, req, res });
  sendData(res, { signedOutEverywhere: true });
};

export const me = async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  const [cart, wishlist] = await Promise.all([
    authService.cartTotals(user.id),
    authService.wishlistTotals(user.id)
  ]);

  sendData(res, { user, cart, wishlist });
};

export const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  sendData(res, { user });
};

export const changePassword = async (req, res) => {
  await authService.changePassword({
    userId: req.user.id,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword
  });

  sendData(res, { passwordChanged: true });
};

export const csrfToken = async (req, res) => {
  // Issues a fresh double-submit token for a client that has cookies but no CSRF
  // value, which happens on the very first request after a silent session refresh.
  sendData(res, { csrfToken: issueCsrfToken(res) });
};

export const wishlistContains = async (req, res) => {
  const contains = await wishlistService.contains(req.user.id, Number(req.params.productId));
  sendData(res, { contains });
};
