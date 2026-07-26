const { validate, Joi } = require('../middlewares/validate');

const createReviewSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  orderId: Joi.string().hex().length(24).allow(null).optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().max(200).allow('', null).optional(),
  comment: Joi.string().trim().min(3).max(2000).required(),
  images: Joi.array().items(Joi.string().uri()).max(5).optional()
});

module.exports = {
  validateCreateReview: validate(createReviewSchema)
};
