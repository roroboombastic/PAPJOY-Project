const { Category, Product } = require('../models');
const logger = require('../utils/logger');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseLimit(value, fallback = 20, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * Resolve the `category` query parameter to Category document ids.
 *
 * The catalogue stores categories with a human name ("Flat", "heels") and a
 * slug that does not always match that name ("womens footwear"), so the lookup
 * accepts either form (case-insensitively) and also supports a comma separated
 * list of categories.
 *
 * Returns null when no category was requested, and an array (possibly empty)
 * when it was - an empty array correctly matches no products instead of
 * silently returning the whole catalogue.
 */
async function resolveCategoryIds(categoryParam) {
  const raw = String(categoryParam || '').trim();
  if (!raw) return null;

  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (!values.length) return null;

  const or = [];
  values.forEach((value) => {
    const safe = escapeRegex(value);
    or.push({ slug: { $regex: `^${safe}$`, $options: 'i' } });
    or.push({ name: { $regex: `^${safe}$`, $options: 'i' } });
  });

  const categories = await Category.find({ $or: or }).select('_id').lean();
  return categories.map((category) => category._id);
}

async function listProducts(req, res) {
  try {
    const { category, featured, limit, page = 1 } = req.query;
    const query = { isActive: true };
    const categoryIds = await resolveCategoryIds(category);
    if (categoryIds) {
      query.categoryId = { $in: categoryIds };
    }
    if (featured === 'true') query.isFeatured = true;
    const perPage = parseLimit(limit);
    const currentPage = Math.max(1, Number(page) || 1);
    const products = await Product.find(query)
      .populate('categoryId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(perPage)
      .skip((currentPage - 1) * perPage)
      .lean();
    const total = await Product.countDocuments(query);
    res.json({ products, pagination: { page: currentPage, limit: perPage, total, pages: Math.ceil(total / perPage) } });
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
      const safeQ = escapeRegex(q);
      and.push({ $or: [
        { name: { $regex: safeQ, $options: 'i' } },
        { description: { $regex: safeQ, $options: 'i' } },
        { tags: { $in: [new RegExp(safeQ, 'i')] } }
      ]});
    }
    if (category) {
      const categoryIds = await resolveCategoryIds(category);
      if (categoryIds) query.categoryId = { $in: categoryIds };
    }
    if (priceMin || priceMax) {
      const priceQuery = {};
      if (priceMin) priceQuery.$gte = Number(priceMin);
      if (priceMax) priceQuery.$lte = Number(priceMax);
      query.price = priceQuery;
    }
    if (brand) query.brand = { $regex: escapeRegex(brand), $options: 'i' };
    if (size) query['variants.value'] = { $regex: escapeRegex(size), $options: 'i' };
    if (color) {
      const safeColor = escapeRegex(color);
      and.push({ $or: [
        { 'variants.value': { $regex: safeColor, $options: 'i' } },
        { 'attributes.value': { $regex: safeColor, $options: 'i' } }
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

    const perPage = parseLimit(limit);
    const currentPage = Math.max(1, Number(page) || 1);
    const products = await Product.find(query)
      .populate('categoryId', 'name slug')
      .sort(sortObj)
      .limit(perPage)
      .skip((currentPage - 1) * perPage)
      .lean();
    const total = await Product.countDocuments(query);
    res.json({ products, pagination: { page: currentPage, limit: perPage, total, pages: Math.ceil(total / perPage) } });
  } catch (err) {
    logger.error('Product search failed', { error: err.message });
    res.status(500).json({ error: 'Search failed' });
  }
}

async function getFilterOptions(req, res) {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    const categoryIds = await resolveCategoryIds(category);
    if (categoryIds) {
      query.categoryId = { $in: categoryIds };
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
    const categories = await Category.find({ isActive: true }).select('name slug').sort({ name: 1 }).lean();
    res.json({
      brands,
      sizes: [...allSizes].sort(),
      colors: [...allColors].sort(),
      priceRange: { min: minPrice === Infinity ? 0 : minPrice, max: maxPrice },
      categories: categories.map((c) => ({ name: c.name, slug: c.slug }))
    });
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
    const conflictQuery = { _id: { $ne: id }, $or: [] };
    if (payload.slug) conflictQuery.$or.push({ slug: payload.slug });
    if (payload.sku) conflictQuery.$or.push({ sku: payload.sku });
    const conflict = conflictQuery.$or.length ? await Product.findOne(conflictQuery) : null;
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
  bulkUpload,
  resolveCategoryIds,
  parseLimit
};
