const express = require('express');
const { auth, verifyAdmin } = require('../middlewares/auth');
const shiprocketController = require('../controllers/shiprocketController');

const router = express.Router();

// Public / checkout
router.get('/status', (req, res) => {
  res.json({ configured: shiprocketController.isConfigured() });
});
router.post('/rates', shiprocketController.getRates);

// Admin
router.get('/pickup-locations', auth, verifyAdmin, shiprocketController.getPickupLocations);
router.post('/orders/:id/ship', auth, verifyAdmin, shiprocketController.createShiprocketOrder);
router.post('/orders/:id/pickup', auth, verifyAdmin, shiprocketController.generatePickup);
router.post('/orders/:id/awb', auth, verifyAdmin, shiprocketController.assignAWB);
router.post('/orders/:id/label', auth, verifyAdmin, shiprocketController.generateLabel);
router.get('/orders/:id/track', auth, verifyAdmin, shiprocketController.trackOrder);

module.exports = router;
