const { Category, Product } = require('../models');
const logger = require('../utils/logger');

async function listProducts(req, res) {
  try {
    const { category, featured, limit = 20, page = 1 } = req.query;
    const query = { isActive: true };
    if (category) {
      const categoryEntity = await Category.findOne({ slug: category });
      if (categoryEntity) query.categoryId = categoryEntity._id;
    }
    if (featured === 'true') query.isFeatured = true;
    const products = await Product.find(query)
      .populate('categoryId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    const total = await Product.countDocuments(query);
    res.json({ products, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Product list failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

async function getProduct(req, res) {
  try {
    const identifier = req.params.slug;
    const query = { isActive: true };
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
      query.$or = [{ _id: identifier }, { slug: identifier }];
    } else {
      query.slug = identifier;
    }
    const product = await Product.findOne(query).populate('categoryId', 'name slug');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    logger.error('Get product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

async function searchProducts(req, res) {
  try {
    const {
      q = '',
      category = '',
      priceMin = 0,
      priceMax = 500000,
      size = '',
      color = '',
      brand = '',
      sort = 'newest',
      limit = 20,
      page = 1,
      inStock = 'false'
    } = req.query;

    const query = { isActive: true };
    const and = [];

    if (q) {
      and.push({ $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]});
    }
    if (category) {
      const categoryEntity = await Category.findOne({ slug: category });
      if (categoryEntity) query.categoryId = categoryEntity._id;
    }
    if (priceMin || priceMax) {
      const priceQuery = {};
      if (priceMin) priceQuery.$gte = Number(priceMin);
      if (priceMax) priceQuery.$lte = Number(priceMax);
      query.price = priceQuery;
    }
    if (brand) query.brand = { $regex: brand, $options: 'i' };
    if (size) query['variants.value'] = { $regex: size, $options: 'i' };
    if (color) {
      and.push({ $or: [
        { 'variants.value': { $regex: color, $options: 'i' } },
        { 'attributes.value': { $regex: color, $options: 'i' } }
      ]});
    }
    if (inStock === 'true') {
      and.push({ $or: [{ 'inventory.quantity': { $gt: 0 } }, { 'variants.inventory': { $gt: 0 } }] });
    }
    if (and.length) query.$and = and;

    let sortObj = { createdAt: -1 };
    if (sort === 'price-asc') sortObj = { price: 1 };
    else if (sort === 'price-desc') sortObj = { price: -1 };
    else if (sort === 'rating') sortObj = { rating: -1, reviewCount: -1 };

    const products = await Product.find(query)
      .populate('categoryId', 'name slug')
      .sort(sortObj)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    const total = await Product.countDocuments(query);
    res.json({ products, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Product search failed', { error: err.message });
    res.status(500).json({ error: 'Search failed' });
  }
}

async function getFilterOptions(req, res) {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    if (category) {
      const categoryEntity = await Category.findOne({ slug: category });
      if (categoryEntity) query.categoryId = categoryEntity._id;
    }
    const products = await Product.find(query).lean();
    const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
    const allSizes = new Set();
    const allColors = new Set();
    let minPrice = Infinity;
    let maxPrice = 0;
    products.forEach((p) => {
      if (typeof p.price === 'number') {
        minPrice = Math.min(minPrice, p.price);
        maxPrice = Math.max(maxPrice, p.price);
      }
      (p.variants || []).forEach((variant) => {
        if (/size/i.test(variant.name)) allSizes.add(variant.value);
        if (/color/i.test(variant.name)) allColors.add(variant.value);
      });
      (p.attributes || []).forEach((attr) => {
        if (/color/i.test(attr.name)) allColors.add(attr.value);
      });
    });
    res.json({ brands, sizes: [...allSizes].sort(), colors: [...allColors].sort(), priceRange: { min: minPrice === Infinity ? 0 : minPrice, max: maxPrice } });
  } catch (err) {
    logger.error('Filter options failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
}

async function createProduct(req, res) {
  try {
    const payload = req.body;
    const existing = await Product.findOne({ $or: [{ slug: payload.slug }, { sku: payload.sku }] });
    if (existing) {
      return res.status(400).json({ error: 'Product with this slug or SKU already exists' });
    }
    const product = await Product.create(payload);
    res.status(201).json(product);
  } catch (err) {
    logger.error('Create product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const payload = req.body;
    const conflict = await Product.findOne({ _id: { $ne: id }, $or: [{ slug: payload.slug }, { sku: payload.sku }] });
    if (conflict) return res.status(400).json({ error: 'Slug or SKU already exists' });
    const product = await Product.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    logger.error('Update product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    logger.error('Delete product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

async function bulkUpload(req, res) {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    if (!products.length) return res.status(400).json({ error: 'No products provided' });
    const created = await Product.insertMany(products.map((item) => ({
      ...item,
      inventory: item.inventory || { quantity: Number(item.inventory?.quantity || 0), lowStockThreshold: 10 }
    })), { ordered: false });
    res.json({ created: created.length, total: products.length });
  } catch (err) {
    logger.error('Bulk upload failed', { error: err.message });
    res.status(500).json({ error: 'Bulk upload failed' });
  }
}

module.exports = {
  listProducts,
  getProduct,
  searchProducts,
  getFilterOptions,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkUpload
};
