export const sendData = (res, data, statusCode = 200) => {
  res.status(statusCode).json({ success: true, data });
};

// Express 5 exposes req.query as a read-only getter, so validated query values
// are stashed on req.validatedQuery by the validate middleware. Controllers
// read through here to get coerced, defaulted values without repeating the
// fallback everywhere.
export const getQuery = (req) => req.validatedQuery ?? req.query;
