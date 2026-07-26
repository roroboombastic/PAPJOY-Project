const { validate, Joi } = require('../middlewares/validate');

const productCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  slug: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().min(1).required(),
  shortDescription: Joi.string().max(500).allow('', null).optional(),
  price: Joi.number().min(0).required(),
  comparePrice: Joi.number().min(0).optional(),
  costPrice: Joi.number().min(0).optional(),
  categoryId: Joi.string().hex().length(24).optional(),
  brand: Joi.string().max(100).allow('', null).optional(),
  sku: Joi.string().max(50).allow('', null).optional(),
  barcode: Joi.string().max(50).allow('', null).optional(),
  hsnCode: Joi.string().max(20).allow('', null).optional(),
  sacCode: Joi.string().max(20).allow('', null).optional(),
  gstPercentage: Joi.number().min(0).max(100).optional(),
  inventory: Joi.object({
    quantity: Joi.number().min(0).optional(),
    lowStockThreshold: Joi.number().min(0).optional(),
    trackInventory: Joi.boolean().optional()
  }).optional(),
  images: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    alt: Joi.string().max(200).optional(),
    isPrimary: Joi.boolean().optional()
  })).optional(),
  videos: Joi.array().items(Joi.string().uri()).optional(),
  variants: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    value: Joi.string().required(),
    priceModifier: Joi.number().optional(),
    sku: Joi.string().optional(),
    barcode: Joi.string().optional(),
    inventory: Joi.number().min(0).optional()
  })).optional(),
  attributes: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    value: Joi.string().required()
  })).optional(),
  tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
  seo: Joi.object({
    title: Joi.string().max(200).optional(),
    description: Joi.string().max(500).optional(),
    keywords: Joi.array().items(Joi.string().max(50)).optional()
  }).optional(),
  isActive: Joi.boolean().optional(),
  isFeatured: Joi.boolean().optional()
});

const productUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  slug: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().min(1).optional(),
  shortDescription: Joi.string().max(500).allow('', null).optional(),
  price: Joi.number().min(0).optional(),
  comparePrice: Joi.number().min(0).optional(),
  costPrice: Joi.number().min(0).optional(),
  categoryId: Joi.string().hex().length(24).optional(),
  brand: Joi.string().max(100).allow('', null).optional(),
  sku: Joi.string().max(50).allow('', null).optional(),
  barcode: Joi.string().max(50).allow('', null).optional(),
  hsnCode: Joi.string().max(20).allow('', null).optional(),
  sacCode: Joi.string().max(20).allow('', null).optional(),
  gstPercentage: Joi.number().min(0).max(100).optional(),
  inventory: Joi.object({
    quantity: Joi.number().min(0).optional(),
    lowStockThreshold: Joi.number().min(0).optional(),
    trackInventory: Joi.boolean().optional()
  }).optional(),
  images: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    alt: Joi.string().max(200).optional(),
    isPrimary: Joi.boolean().optional()
  })).optional(),
  videos: Joi.array().items(Joi.string().uri()).optional(),
  variants: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    value: Joi.string().required(),
    priceModifier: Joi.number().optional(),
    sku: Joi.string().optional(),
    barcode: Joi.string().optional(),
    inventory: Joi.number().min(0).optional()
  })).optional(),
  attributes: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    value: Joi.string().required()
  })).optional(),
  tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
  seo: Joi.object({
    title: Joi.string().max(200).optional(),
    description: Joi.string().max(500).optional(),
    keywords: Joi.array().items(Joi.string().max(50)).optional()
  }).optional(),
  isActive: Joi.boolean().optional(),
  isFeatured: Joi.boolean().optional()
}).min(1);

module.exports = {
  validateProductCreate: validate(productCreateSchema),
  validateProductUpdate: validate(productUpdateSchema)
};
