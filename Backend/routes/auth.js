const express = require('express');
const { validate, Joi } = require('../middlewares/validate');
const { auth } = require('../middlewares/auth');
const authController = require('../controllers/authController');

const router = express.Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).required(),
  phone: Joi.string().optional(),
  marketingOptIn: Joi.boolean().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const idTokenSchema = Joi.object({
  idToken: Joi.string().required()
});

const passwordResetSchema = Joi.object({
  email: Joi.string().email().required()
});

const passwordUpdateSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).required()
});

const updateProfileSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().min(2).optional(),
  phone: Joi.string().optional(),
  marketingOptIn: Joi.boolean().optional(),
  preferredPaymentMethod: Joi.string().valid('card', 'paypal', 'bank_transfer', 'cod', 'upi', 'bnpl', 'wallet').optional(),
  shippingAddress: Joi.object({
    fullName: Joi.string().optional(),
    phone: Joi.string().optional(),
    line1: Joi.string().optional(),
    line2: Joi.string().allow('').optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    postalCode: Joi.string().optional(),
    country: Joi.string().optional()
  }).optional(),
  preferences: Joi.object().optional()
});

const addressSchema = Joi.object({
  type: Joi.string().valid('billing', 'shipping').optional(),
  name: Joi.string().optional(),
  phone: Joi.string().optional(),
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  zipCode: Joi.string().required(),
  country: Joi.string().optional(),
  isDefault: Joi.boolean().optional()
});

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refreshToken);
router.get('/me', auth, authController.me);
router.put('/me', auth, validate(updateProfileSchema), authController.updateProfile);
router.get('/addresses', auth, authController.getAddresses);
router.post('/addresses', auth, validate(addressSchema), authController.addAddress);
router.put('/addresses/:addressId', auth, validate(addressSchema), authController.updateAddress);
router.delete('/addresses/:addressId', auth, authController.deleteAddress);
router.post('/google', validate(idTokenSchema), authController.googleOAuth);
router.post('/forgot-password', validate(passwordResetSchema), authController.forgotPassword);
router.post('/reset-password', validate(passwordUpdateSchema), authController.resetPassword);
router.get('/google-config', authController.googleConfig);
router.post('/logout', auth, authController.logout);

module.exports = router;
