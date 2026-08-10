const fs = require('fs');
const path = require('path');
const { Product } = require('../models');
const { isConnected, deleteFileByNameSafe } = require('../utils/gridfs');
const logger = require('../utils/logger');

const productsDir = path.join(__dirname, '../../uploads/products');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function collectReferencedFilenames() {
  const referenced = new Set();
  const products = await Product.find({}, { images: 1, videos: 1 }).lean();
  for (const product of products) {
    for (const img of product.images || []) {
      if (img && img.url) {
        const name = img.url.replace(/^\/?uploads\/products\//, '');
        if (name) referenced.add(name);
      }
    }
    for (const video of product.videos || []) {
      if (typeof video === 'string') {
        const name = video.replace(/^\/?uploads\/products\//, '');
        if (name) referenced.add(name);
      }
    }
  }
  return referenced;
}

async function listGridFSNames() {
  if (!isConnected()) return [];
  try {
    const bucket = new (require('mongoose').mongo.GridFSBucket)(
      require('mongoose').connection.db,
      { bucketName: 'uploads' }
    );
    const files = await bucket.find({}).toArray();
    return files.map(f => f.filename);
  } catch (err) {
    logger.warn('GridFS list failed during orphan cleanup', { error: err.message });
    return [];
  }
}

async function runCleanup() {
  try {
    const referenced = await collectReferencedFilenames();
    const diskFiles = fs.existsSync(productsDir) ? fs.readdirSync(productsDir) : [];
    const gridFiles = await listGridFSNames();

    let removed = 0;
    const now = Date.now();

    const isTooRecent = (filename) => {
      try {
        const stat = fs.statSync(path.join(productsDir, filename));
        return (now - stat.mtimeMs) < MAX_AGE_MS;
      } catch {
        return false;
      }
    };

    for (const filename of diskFiles) {
      const gridName = `products/${filename}`;
      const isReferenced = referenced.has(filename);
      const inGrid = gridFiles.includes(gridName);
      if (isReferenced) continue;
      if (inGrid && isTooRecent(filename)) continue;

      try {
        fs.unlinkSync(path.join(productsDir, filename));
        removed++;
      } catch (err) {
        logger.warn('Orphan disk file delete failed', { filename, error: err.message });
      }
      await deleteFileByNameSafe(gridName);
    }

    for (const gridName of gridFiles) {
      const filename = gridName.replace(/^products\//, '');
      if (referenced.has(filename)) continue;
      const hasDisk = diskFiles.includes(filename);
      if (hasDisk) continue;
      await deleteFileByNameSafe(gridName);
      removed++;
    }

    if (removed > 0) {
      logger.info('Orphaned upload cleanup complete', { removed, totalDisk: diskFiles.length });
    }
    return removed;
  } catch (err) {
    logger.warn('Orphaned upload cleanup failed', { error: err.message });
    return 0;
  }
}

let started = false;

function startCleanupScheduler() {
  if (started) return;
  started = true;
  const run = () => {
    if (!isConnected()) return;
    runCleanup().catch(() => {});
  };
  setTimeout(run, 60 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}

module.exports = { runCleanup, startCleanupScheduler };
