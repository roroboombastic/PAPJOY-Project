const express = require('express');
const { optionalAuth } = require('../middlewares/auth');
const recommendationController = require('../controllers/recommendationController');

const router = express.Router();

router.get('/', optionalAuth, recommendationController.getRecommendations);

module.exports = router;
