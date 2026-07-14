const express = require('express');
const { auth, verifyAdmin } = require('../middlewares/auth');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.get('/', categoryController.getCategories);
router.post('/', auth, verifyAdmin, categoryController.createCategory);
router.put('/:id', auth, verifyAdmin, categoryController.updateCategory);
router.delete('/:id', auth, verifyAdmin, categoryController.deleteCategory);

module.exports = router;
