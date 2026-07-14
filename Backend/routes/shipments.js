const express = require('express');
const { auth, verifyAdmin } = require('../middlewares/auth');
const shipmentController = require('../controllers/shipmentController');

const router = express.Router();

router.get('/', auth, shipmentController.getShipments);
router.put('/:orderNumber', auth, verifyAdmin, shipmentController.updateShipmentStatus);

module.exports = router;
