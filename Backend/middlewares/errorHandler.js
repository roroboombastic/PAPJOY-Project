const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    method: req.method
  });

  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const payload = {
    error: err.type === 'entity.parse.failed' ? 'Invalid JSON payload' : 'Internal server error',
    requestId: req.id
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.message = err.message;
    payload.details = err.stack;
  }

  res.status(status).json(payload);
}

module.exports = errorHandler;
