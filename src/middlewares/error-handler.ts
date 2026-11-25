import type { ErrorRequestHandler, RequestHandler } from 'express';

import { env } from '../config/env';
import { AppError } from '../lib/app-error';
import { mapPgError } from '../lib/pg-error-map';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Không tìm thấy đường dẫn ${req.method} ${req.originalUrl}`));
};

// express.json() errors carry a `type`
function fromBodyParser(err: { type?: string }): AppError | undefined {
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Nội dung gửi lên không phải JSON hợp lệ');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = err instanceof AppError ? err : (mapPgError(err) ?? fromBodyParser(err));

  if (!appError) {
    req.log.error({ err }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: env.isProduction ? 'Hệ thống đang gặp sự cố, vui lòng thử lại sau' : err.message,
      },
    });
    return;
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.field && { field: appError.field }),
      ...appError.extra,
    },
  });
};
