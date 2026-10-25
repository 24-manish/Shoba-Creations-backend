import { z } from 'zod';
import { AppError } from './async-handler.js';

const formatIssues = (error) => error.issues.map((issue) => ({
  path: issue.path,
  message: issue.message
}));

export const validate = (schema, target = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[target]);

    if (target === 'query') {
      req.validatedQuery = parsed;
    } else {
      req[target] = parsed;
    }

    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', formatIssues(error)));
      return;
    }

    next(error);
  }
};
