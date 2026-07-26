const { Coupon, Product, Category } = require('../models');
const logger = require('../utils/logger');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function validateCoupon(req, res) {
  try {
    const { code, subtotal, items = [] } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ error: 'This coupon is no longer active' });
    }

    const now = new Date();
    if (coupon.validFrom > now) {
      return res.status(400).json({ error: 'This coupon is not yet valid' });
    }
    if (coupon.validUntil < now) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ error: 'This coupon has reached its usage limit' });
    }

    const orderSubtotal = Number(subtotal) || 0;
    if (coupon.minOrderValue > 0 && orderSubtotal < coupon.minOrderValue) {
      return res.status(400).json({
        error: `Minimum order value of ₹${coupon.minOrderValue} required for this coupon`
      });
    }

    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round(orderSubtotal * (coupon.value / 100));
      if (coupon.maxDiscount > 0) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = Math.min(coupon.value, orderSubtotal);
    }

    const label = coupon.type === 'percentage'
      ? `${coupon.value}% off`
      : `₹${coupon.value} off`;

    logger.info('Coupon validated', { code: coupon.code, discount, userId: req.userId || 'guest' });

    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      label,
      maxDiscount: coupon.maxDiscount,
      minOrderValue: coupon.minOrderValue
    });
  } catch (err) {
    logger.error('Validate coupon failed', { error: err.message });
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
}

async function createCoupon(req, res) {
  try {
    const {
      code, type, value, minOrderValue, maxDiscount,
      usageLimit, validFrom, validUntil,
      applicableCategories, applicableProducts
    } = req.body;

    const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'Coupon with this code already exists' });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type,
      value,
      minOrderValue: minOrderValue || 0,
      maxDiscount: maxDiscount || 0,
      usageLimit: usageLimit || 0,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: new Date(validUntil),
      applicableCategories: applicableCategories || [],
      applicableProducts: applicableProducts || [],
      isActive: true
    });

    logger.info('Coupon created', { code: coupon.code, type: coupon.type, value: coupon.value });
    res.status(201).json(coupon);
  } catch (err) {
    logger.error('Create coupon failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create coupon' });
  }
}

async function updateCoupon(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.code) {
      updates.code = updates.code.toUpperCase().trim();
      const existing = await Coupon.findOne({ code: updates.code, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ error: 'Coupon with this code already exists' });
      }
    }

    if (updates.validFrom) updates.validFrom = new Date(updates.validFrom);
    if (updates.validUntil) updates.validUntil = new Date(updates.validUntil);

    const coupon = await Coupon.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    logger.info('Coupon updated', { code: coupon.code, id: coupon._id });
    res.json(coupon);
  } catch (err) {
    logger.error('Update coupon failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update coupon' });
  }
}

async function deleteCoupon(req, res) {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    logger.info('Coupon deactivated', { code: coupon.code, id: coupon._id });
    res.json({ message: 'Coupon deactivated', coupon });
  } catch (err) {
    logger.error('Delete coupon failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
}

async function listCoupons(req, res) {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.code = { $regex: safeSearch, $options: 'i' };
    }

    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const total = await Coupon.countDocuments(query);

    res.json({
      coupons,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    logger.error('List coupons failed', { error: err.message });
    res.status(500).json({ error: 'Failed to list coupons' });
  }
}

module.exports = {
  validateCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listCoupons
};
