const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https = require('https');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const emailService = require('../services/emailService');
const {
  FRONTEND_URL,
  JWT_SECRET,
  JWT_EXPIRE,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRE,
  GOOGLE_CLIENT_ID,
  ADMIN_EMAILS,
  isProd
} = require('../config');
const logger = require('../utils/logger');

function signToken(payload, secret, expiresIn) {
  if (!secret || secret.length < 32) {
    throw new Error('JWT signing secret is not configured (set JWT_SECRET / JWT_REFRESH_SECRET)');
  }
  return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256', issuer: 'papjoy' });
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}

function userResponse(user) {
  const role = isAdminEmail(user.email) ? (user.role === 'super_admin' ? 'super_admin' : 'admin') : user.role;
  return { id: user._id, email: user.email, name: user.name, role, shippingAddress: user.shippingAddress || {}, phone: user.phone };
}

async function register(req, res) {
  const { email, password, name, phone, marketingOptIn, shippingAddress } = req.body;
  try {
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Email, password, and name are required' });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, error: 'User with this email already exists' });
    }
    if (phone) {
      const existingPhone = await User.findOne({ phone: phone.trim() });
      if (existingPhone) {
        return res.status(409).json({ success: false, error: 'Phone number already in use' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const assignedRole = isAdminEmail(normalizedEmail) ? 'admin' : 'customer';
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      phone: phone?.trim(),
      shippingAddress: shippingAddress || {},
      marketingOptIn: Boolean(marketingOptIn),
      role: assignedRole,
      isActive: true
    });

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    logger.info('User registered', { userId: user._id, email: user.email, role: user.role });
    const isSecure = isProd;
    res.cookie('papjoy-auth', token, { httpOnly: true, secure: isSecure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.cookie('papjoy-refresh', refreshToken, { httpOnly: true, secure: isSecure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.status(201).json({ success: true, token, refreshToken, user: userResponse(user) });
  } catch (err) {
    logger.error('Register failed', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    logger.info('User logged in', { userId: user._id, email: user.email });
    const secure = isProd;
    res.cookie('papjoy-auth', token, { httpOnly: true, secure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.cookie('papjoy-refresh', refreshToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ success: true, token, refreshToken, user: userResponse(user) });
  } catch (err) {
    logger.error('Login failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'papjoy' });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    res.json({ success: true, token });
  } catch (err) {
    logger.warn('Refresh token invalid', { error: err.message });
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
}

async function me(req, res) {
  try {
    const user = await User.findById(req.userId).select('-passwordHash -passwordResetToken -passwordResetExpires');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const userObj = user.toObject();
    if (isAdminEmail(userObj.email) && userObj.role !== 'super_admin') {
      userObj.role = 'admin';
    }
    res.json({ success: true, user: userObj });
  } catch (err) {
    logger.error('Fetch profile failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to fetch user profile' });
  }
}

function fetchGoogleTokenInfo(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          return reject(new Error('Invalid Google token'));
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (parseError) {
          reject(parseError);
        }
      });
    }).on('error', (error) => reject(error));
  });
}

async function googleOAuth(req, res) {
  const { idToken } = req.body;
  try {
    const payload = await fetchGoogleTokenInfo(idToken);
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(400).json({ success: false, error: 'Google token audience mismatch' });
    }

    const email = payload.email?.toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Google token missing email' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const assignedRole = isAdminEmail(email) ? 'admin' : 'customer';
      user = await User.create({
        email,
        name: payload.name || 'Google User',
        oauthProvider: 'google',
        oauthId: payload.sub,
        isActive: true,
        role: assignedRole
      });
    }

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    const secure = isProd;
    res.cookie('papjoy-auth', token, { httpOnly: true, secure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.cookie('papjoy-refresh', refreshToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ success: true, token, refreshToken, user: userResponse(user) });
  } catch (err) {
    logger.error('Google authentication failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  const normalizedEmail = String(email).toLowerCase();
  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.json({ success: true, message: 'If that email is registered, password reset instructions will be sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${FRONTEND_URL}/reset-password.html?token=${resetToken}`;
    logger.info('Password reset token generated', { userId: user._id, email: normalizedEmail });

    const emailResult = await emailService.sendMail({
      to: normalizedEmail,
      subject: 'Reset your PAP-JOY password',
      html: emailService.passwordResetTemplate(user.name, resetUrl)
    });

    logger.info('Password reset email result', { emailResult });

    if (emailResult?.skipped || emailResult?.error) {
      res.json({ success: true, message: 'Password reset link generated.', resetUrl });
    } else {
      res.json({ success: true, message: 'If that email is registered, password reset instructions will be sent.' });
    }
  } catch (err) {
    logger.error('Password reset request failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to create password reset token' });
  }
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    logger.error('Reset password failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to reset password' });
  }
}

function googleConfig(req, res) {
  res.json({ success: true, clientId: GOOGLE_CLIENT_ID });
}

async function updateProfile(req, res) {
  const updates = {};
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.body.email) {
      const email = req.body.email.toLowerCase();
      if (email !== user.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(409).json({ success: false, error: 'Email already in use' });
        }
        updates.email = email;
      }
    }

    if (req.body.name) {
      updates.name = req.body.name.trim();
    }

    if (req.body.phone) {
      const phone = req.body.phone.trim();
      if (phone !== user.phone) {
        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
          return res.status(409).json({ success: false, error: 'Phone number already in use' });
        }
      }
      updates.phone = phone;
    }

    if (typeof req.body.marketingOptIn !== 'undefined') {
      updates.marketingOptIn = Boolean(req.body.marketingOptIn);
    }

    if (req.body.shippingAddress) {
      updates.shippingAddress = {
        fullName: req.body.shippingAddress.fullName || user.shippingAddress?.fullName || user.name,
        phone: req.body.shippingAddress.phone || user.shippingAddress?.phone || user.phone,
        line1: req.body.shippingAddress.line1 || user.shippingAddress?.line1 || '',
        line2: req.body.shippingAddress.line2 || user.shippingAddress?.line2 || '',
        city: req.body.shippingAddress.city || user.shippingAddress?.city || '',
        state: req.body.shippingAddress.state || user.shippingAddress?.state || '',
        postalCode: req.body.shippingAddress.postalCode || user.shippingAddress?.postalCode || '',
        country: req.body.shippingAddress.country || user.shippingAddress?.country || 'India'
      };
    }

    if (req.body.preferences) {
      updates.preferences = {
        ...user.preferences,
        ...req.body.preferences
      };
    }

    if (req.body.preferredPaymentMethod) {
      updates.preferredPaymentMethod = req.body.preferredPaymentMethod;
    }

    const updatedUser = await User.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
    if (!updatedUser) return res.status(404).json({ success: false, error: 'Unable to update profile' });

    const responseUser = updatedUser.toObject();
    delete responseUser.passwordHash;
    delete responseUser.passwordResetToken;
    delete responseUser.passwordResetExpires;

    if (isAdminEmail(responseUser.email) && responseUser.role !== 'super_admin') {
      responseUser.role = 'admin';
    }

    res.json({ success: true, user: responseUser });
  } catch (err) {
    logger.error('Update profile failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to update profile' });
  }
}

async function logout(req, res) {
  logger.info('User logged out', { userId: req.userId });
  res.clearCookie('papjoy-auth', { path: '/' });
  res.clearCookie('papjoy-refresh', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
}

// Address Management Functions
async function getAddresses(req, res) {
  try {
    const user = await User.findById(req.userId).select('addresses');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, addresses: user.addresses || [] });
  } catch (err) {
    logger.error('Fetch addresses failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch addresses' });
  }
}

async function addAddress(req, res) {
  try {
    const { type, name, phone, street, city, state, zipCode, country, isDefault } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const newAddress = {
      type: type || 'shipping',
      name: name || user.name,
      phone: phone || user.phone,
      street,
      city,
      state,
      zipCode,
      country: country || 'India',
      isDefault: isDefault === true ? true : false
    };

    // If marking as default, unset other defaults of same type
    if (newAddress.isDefault) {
      if (!user.addresses) user.addresses = [];
      user.addresses.forEach(addr => {
        if (addr.type === newAddress.type) addr.isDefault = false;
      });
    }

    if (!user.addresses) user.addresses = [];
    user.addresses.push(newAddress);
    const updated = await user.save();
    res.status(201).json({ success: true, address: updated.addresses[updated.addresses.length - 1] });
  } catch (err) {
    logger.error('Add address failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to add address' });
  }
}

async function updateAddress(req, res) {
  try {
    const { addressId } = req.params;
    const updates = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const address = user.addresses?.find(a => a._id?.toString() === addressId);
    if (!address) return res.status(404).json({ success: false, error: 'Address not found' });

    // Update address fields
    const allowedFields = ['type', 'name', 'phone', 'street', 'city', 'state', 'zipCode', 'country', 'isDefault'];
    for (const field of allowedFields) {
      if (typeof updates[field] !== 'undefined') {
        address[field] = updates[field];
      }
    }

    // If marking as default, unset other defaults of same type
    if (updates.isDefault === true) {
      user.addresses.forEach(addr => {
        if (addr.type === address.type && addr._id?.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    await user.save();
    res.json({ success: true, address });
  } catch (err) {
    logger.error('Update address failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update address' });
  }
}

async function deleteAddress(req, res) {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const addressIndex = user.addresses?.findIndex(a => a._id?.toString() === addressId);
    if (addressIndex === -1 || addressIndex === undefined) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    user.addresses.splice(addressIndex, 1);
    await user.save();
    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (err) {
    logger.error('Delete address failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete address' });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (!user.passwordHash) {
      return res.status(400).json({ success: false, error: 'Account uses social login. Password change not available.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save({ validateBeforeSave: false });

    logger.info('Password changed', { userId: user._id });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to change password' });
  }
}

async function deleteAccount(req, res) {
  const { password } = req.body;
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.passwordHash) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password required to delete account' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Incorrect password' });
      }
    }

    user.isActive = false;
    user.email = `deleted_${user._id}@deleted.papjoy`;
    user.name = 'Deleted User';
    user.passwordHash = undefined;
    user.phone = undefined;
    user.shippingAddress = undefined;
    user.addresses = [];
    user.savedPaymentMethods = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info('Account deleted', { userId: user._id });
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    logger.error('Delete account failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Unable to delete account' });
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  me,
  updateProfile,
  googleOAuth,
  forgotPassword,
  resetPassword,
  googleConfig,
  logout,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  changePassword,
  deleteAccount
};
