const express = require('express');
const { auth, optionalAuth, verifyAdmin } = require('../middlewares/auth');
const shipmentController = require('../controllers/shipmentController');

const router = express.Router();

router.get('/', auth, shipmentController.getShipments);
router.get('/:orderNumber/tracking', optionalAuth, shipmentController.getShipmentTracking);
router.put('/:orderNumber', auth, verifyAdmin, shipmentController.updateShipmentStatus);
router.put('/:orderNumber/location', auth, verifyAdmin, shipmentController.updateShipmentLocation);

module.exports = router;
