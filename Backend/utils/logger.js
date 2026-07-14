function info(message, meta = {}) {
  console.log(`[INFO] ${message}`, JSON.stringify(meta));
}

function warn(message, meta = {}) {
  console.warn(`[WARN] ${message}`, JSON.stringify(meta));
}

function error(message, meta = {}) {
  console.error(`[ERROR] ${message}`, JSON.stringify(meta));
}

function debug(message, meta = {}) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[DEBUG] ${message}`, JSON.stringify(meta));
  }
}

module.exports = {
  info,
  warn,
  error,
  debug
};
