const express = require('express');
const { validate, Joi } = require('../middlewares/validate');
const { auth, optionalAuth, verifyAdmin } = require('../middlewares/auth');
const couponController = require('../controllers/couponController');

const router = express.Router();

const validateCouponSchema = Joi.object({
  code: Joi.string().required(),
  subtotal: Joi.number().min(0).optional(),
  items: Joi.array().optional()
});

const createCouponSchema = Joi.object({
  code: Joi.string().min(2).max(30).required(),
  type: Joi.string().valid('percentage', 'fixed').required(),
  value: Joi.number().min(0).required(),
  minOrderValue: Joi.number().min(0).optional(),
  maxDiscount: Joi.number().min(0).optional(),
  usageLimit: Joi.number().min(0).optional(),
  validFrom: Joi.date().optional(),
  validUntil: Joi.date().required(),
  applicableCategories: Joi.array().optional(),
  applicableProducts: Joi.array().optional()
});

const updateCouponSchema = Joi.object({
  code: Joi.string().min(2).max(30).optional(),
  type: Joi.string().valid('percentage', 'fixed').optional(),
  value: Joi.number().min(0).optional(),
  minOrderValue: Joi.number().min(0).optional(),
  maxDiscount: Joi.number().min(0).optional(),
  usageLimit: Joi.number().min(0).optional(),
  validFrom: Joi.date().optional(),
  validUntil: Joi.date().optional(),
  isActive: Joi.boolean().optional(),
  applicableCategories: Joi.array().optional(),
  applicableProducts: Joi.array().optional()
}).min(1);

router.post('/validate', optionalAuth, validate(validateCouponSchema), couponController.validateCoupon);
router.get('/', auth, verifyAdmin, couponController.listCoupons);
router.post('/', auth, verifyAdmin, validate(createCouponSchema), couponController.createCoupon);
router.put('/:id', auth, verifyAdmin, validate(updateCouponSchema), couponController.updateCoupon);
router.delete('/:id', auth, verifyAdmin, couponController.deleteCoupon);

module.exports = router;
