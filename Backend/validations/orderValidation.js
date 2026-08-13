const { validate, Joi } = require('../middlewares/validate');

const orderItemSchema = Joi.object({
  productId: Joi.alternatives().try(Joi.string().hex().length(24), Joi.string()).optional(),
  id: Joi.alternatives().try(Joi.string().hex().length(24), Joi.string()).optional(),
  name: Joi.string().trim().min(1).max(200).required(),
  variant: Joi.string().max(100).allow('', null).optional(),
  quantity: Joi.number().integer().min(1).required(),
  price: Joi.number().min(0).required(),
  total: Joi.number().min(0).optional(),
  gstRate: Joi.number().min(0).max(100).optional()
});

const addressSchema = Joi.object({
  name: Joi.string().max(100).allow('', null).optional(),
  fullName: Joi.string().max(100).allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
  phone: Joi.string().max(20).allow('', null).optional(),
  street: Joi.string().max(200).allow('', null).optional(),
  address: Joi.string().max(200).allow('', null).optional(),
  city: Joi.string().max(100).allow('', null).optional(),
  state: Joi.string().max(100).allow('', null).optional(),
  zipCode: Joi.string().max(20).allow('', null).optional(),
  postalCode: Joi.string().max(20).allow('', null).optional(),
  postal: Joi.string().max(20).allow('', null).optional(),
  country: Joi.string().max(100).allow('', null).optional()
});

const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required(),
  paymentMethod: Joi.string().valid('card', 'cod', 'upi').required(),
  shipping: Joi.number().min(0).optional(),
  tax: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  currency: Joi.string().length(3).uppercase().optional(),
  deliveryInfo: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  amount: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).allow('', null).optional(),
  paymentStatus: Joi.string().valid('pending', 'paid', 'failed', 'refunded').optional()
});

module.exports = {
  validateCreateOrder: validate(createOrderSchema)
};
