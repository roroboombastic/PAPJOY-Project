const express = require('express');
const { auth } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.get('/', auth, notificationController.getNotifications);
router.patch('/:notificationId/read', auth, notificationController.markAsRead);

module.exports = router;
