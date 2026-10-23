const express = require('express');
const rateLimit = require('express-rate-limit');
const { auth, verifyAdmin } = require('../middlewares/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();

// Every AI call costs money, so the public endpoints are deliberately tight.
// Admin endpoints are looser but still bounded.
const publicAILimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes.', code: 'rate_limited' }
});

const adminAILimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes.', code: 'rate_limited' }
});

router.get('/status', aiController.getStatus);

router.post('/search', publicAILimiter, aiController.searchProducts);
router.post('/chat', publicAILimiter, aiController.chat);

router.post('/describe', adminAILimiter, auth, verifyAdmin, aiController.describeProduct);
router.post('/generate-product', adminAILimiter, auth, verifyAdmin, aiController.generateProduct);

module.exports = router;
