const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { auth, verifyAdmin } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');
const { validateProductCreate, validateProductUpdate } = require('../validations/productValidation');
const { uploadToGridFS, isConnected } = require('../utils/gridfs');
const logger = require('../utils/logger');

const uploadsDir = path.join(__dirname, '../../uploads/products');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|mov)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only images (jpg, png, gif, webp, avif, svg) and videos (mp4, webm, mov) are allowed'));
  }
});

async function persistUploads(req, res, next) {
  try {
    if (!req.files || !req.files.length) return next();
    if (!isConnected()) return res.status(503).json({ error: 'Database unavailable. Please try again in a moment.' });
    for (const file of req.files) {
      const ext = path.extname(file.originalname);
      const name = `${crypto.randomBytes(8).toString('hex')}${ext}`;
      await uploadToGridFS(`products/${name}`, file.buffer, file.mimetype);
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, name), file.buffer);
      } catch (diskErr) {
        logger.warn('Local disk write failed for upload', { name, error: diskErr.message });
      }
      file.filename = name;
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save uploaded files. Please try again.' });
  }
}

const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests, please try again later' }
});

const router = express.Router();
router.use(auth);
router.use(verifyAdmin);

function parseFormDataJson(req, res, next) {
  if (!req.files || !req.files.length) return next();
  const jsonFields = ['images', 'videos', 'inventory', 'seo', 'tags', 'attributes', 'variants'];
  jsonFields.forEach(key => {
    if (typeof req.body[key] === 'string') {
      try { req.body[key] = JSON.parse(req.body[key]); } catch { /* leave as-is */ }
    }
  });
  ['isActive', 'isFeatured'].forEach(key => {
    if (typeof req.body[key] === 'string') req.body[key] = req.body[key] === 'true';
  });
  ['price', 'comparePrice', 'costPrice', 'gstPercentage'].forEach(key => {
    if (typeof req.body[key] === 'string') req.body[key] = Number(req.body[key]);
  });
  next();
}

router.get('/summary', adminController.getSummary);
router.get('/products', adminController.getProducts);
router.get('/products/:id', adminController.getProductById);
router.get('/orders', adminController.getOrders);
router.get('/orders/:id', adminController.getOrderById);
router.get('/users', adminController.getUsers);
router.get('/analytics', adminController.getAnalytics);
router.get('/reports', adminController.getReports);
router.get('/categories', adminController.getAdminCategories);
router.get('/categories/:id', adminController.getCategoryById);

router.post('/uploads', adminWriteLimiter, upload.array('media', 10), persistUploads, adminController.uploadFiles);
router.post('/products', adminWriteLimiter, upload.array('media', 10), persistUploads, parseFormDataJson, validateProductCreate, adminController.createProduct);
router.put('/products/:id', adminWriteLimiter, upload.array('media', 10), persistUploads, parseFormDataJson, validateProductUpdate, adminController.updateProduct);
router.delete('/products/:id', adminWriteLimiter, adminController.deleteProduct);

router.put('/orders/:id/status', adminWriteLimiter, adminController.updateOrderStatus);

router.post('/categories', adminWriteLimiter, adminController.createCategory);
router.put('/categories/:id', adminWriteLimiter, adminController.updateCategory);
router.delete('/categories/:id', adminWriteLimiter, adminController.deleteCategory);

router.put('/users/:id/role', adminWriteLimiter, adminController.updateUserRole);
router.put('/users/:id/status', adminWriteLimiter, adminController.updateUserStatus);

module.exports = router;
