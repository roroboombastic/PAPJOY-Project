const express = require('express');
const webhookController = require('../controllers/webhookController');
const shiprocketController = require('../controllers/shiprocketController');

const router = express.Router();

router.get('/', webhookController.getStatus);

// Shiprocket tracking webhook.
// NOTE: the URL must not contain the words shiprocket/kartrocket/sr/kr
// (Shiprocket rejects such callback URLs), hence it lives here, not under /shiprocket.
// Accepts POST on /api/v1/webhook-status/courier AND the shorter /api/v1/courier alias.
router.post('/courier', shiprocketController.handleWebhook);
router.post('/', shiprocketController.handleWebhook);

module.exports = router;
