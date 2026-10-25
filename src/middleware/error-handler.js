import { AppError } from './async-handler.js';

export const notFoundHandler = (req, res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`, 'NOT_FOUND'));
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON' }
    });
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_RESOURCE', message: 'A record with that value already exists' }
    });
    return;
  }

  if (error?.code === '23503') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REFERENCE', message: 'A referenced record does not exist' }
    });
    return;
  }

  // Multer surfaces upload limits and filter rejections as coded errors; the
  // AppError thrown by the file filter arrives here as-is.
  if (error?.name === 'MulterError') {
    const message = {
      LIMIT_FILE_SIZE: `Each image must be smaller than ${Math.round(Number(process.env.UPLOAD_MAX_BYTES ?? 5242880) / 1024 / 1024)}MB`,
      LIMIT_FILE_COUNT: 'Too many images in one upload',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field'
    }[error.code] ?? 'The image upload could not be processed';

    res.status(error.code === 'LIMIT_UNEXPECTED_FILE' ? 400 : 413).json({
      success: false,
      error: { code: 'UPLOAD_FAILED', message }
    });
    return;
  }

  if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' }
    });
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof AppError ? error.message : 'Internal server error';

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(error instanceof AppError && error.details ? { details: error.details } : {})
    }
  });
};
