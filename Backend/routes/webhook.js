const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

router.get('/', webhookController.getStatus);

module.exports = router;
