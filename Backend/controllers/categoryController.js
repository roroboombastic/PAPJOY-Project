const { Category } = require('../models');
const logger = require('../utils/logger');

async function getCategories(req, res) {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, categories });
  } catch (err) {
    logger.error('Get categories failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
}

async function createCategory(req, res) {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, category });
  } catch (err) {
    logger.error('Create category failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
}

async function updateCategory(req, res) {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, category });
  } catch (err) {
    logger.error('Update category failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
}

async function deleteCategory(req, res) {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    logger.error('Delete category failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
