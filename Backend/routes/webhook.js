const express = require('express');
const webhookController = require('../controllers/webhookController');
const shiprocketController = require('../controllers/shiprocketController');

const router = express.Router();

router.get('/', webhookController.getStatus);

// Shiprocket tracking webhook.
// NOTE: the URL must not contain the words shiprocket/kartrocket/sr/kr
// (Shiprocket rejects such callback URLs), hence it lives here, not under /shiprocket.
router.post('/courier', shiprocketController.handleWebhook);

module.exports = router;
