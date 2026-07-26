const { validate, Joi } = require('../middlewares/validate');

const razorpayCreateSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  currency: Joi.string().length(3).uppercase().optional(),
  receipt: Joi.string().max(255).optional(),
  notes: Joi.object().optional()
});

const razorpayVerifySchema = Joi.object({
  razorpay_payment_id: Joi.string().trim().min(1).required(),
  razorpay_order_id: Joi.string().trim().min(1).required(),
  razorpay_signature: Joi.string().trim().min(1).required(),
  items: Joi.array().items(Joi.object({
    productId: Joi.alternatives().try(Joi.string().hex().length(24), Joi.string()).optional(),
    id: Joi.alternatives().try(Joi.string().hex().length(24), Joi.string()).optional(),
    name: Joi.string().max(200).optional(),
    variant: Joi.string().max(100).optional(),
    quantity: Joi.number().integer().min(1).optional(),
    price: Joi.number().min(0).optional(),
    gstRate: Joi.number().min(0).max(100).optional()
  })).min(1).optional(),
  deliveryInfo: Joi.object().optional(),
  shipping: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).optional()
});

const upiQRSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  orderNumber: Joi.string().max(50).optional(),
  upiId: Joi.string().max(100).optional()
});

const refundSchema = Joi.object({
  orderId: Joi.string().trim().min(1).required(),
  amount: Joi.number().min(0).optional(),
  reason: Joi.string().max(500).optional()
});

module.exports = {
  validateRazorpayCreate: validate(razorpayCreateSchema),
  validateRazorpayVerify: validate(razorpayVerifySchema),
  validateUPIQR: validate(upiQRSchema),
  validateRefund: validate(refundSchema)
};
