const express = require('express');
const { auth, verifyAdmin } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();
router.use(auth);
router.use(verifyAdmin);

router.get('/summary', adminController.getSummary);
router.get('/dashboard', adminController.getSummary);
router.get('/products', adminController.getProducts);
router.get('/orders', adminController.getOrders);
router.get('/users', adminController.getUsers);
router.get('/analytics', adminController.getAnalytics);
router.get('/reports', adminController.getReports);
router.get('/categories', adminController.getAdminCategories);

module.exports = router;
