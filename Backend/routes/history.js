const express = require('express');
const { auth } = require('../middlewares/auth');
const historyController = require('../controllers/historyController');

const router = express.Router();

router.post('/', auth, historyController.saveHistory);

module.exports = router;
