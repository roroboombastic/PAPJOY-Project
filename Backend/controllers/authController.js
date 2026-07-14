const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https = require('https');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const {
  APP_URL,
  JWT_SECRET,
  JWT_EXPIRE,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRE,
  GOOGLE_CLIENT_ID
} = require('../config');
const logger = require('../utils/logger');

function signToken(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256', issuer: 'papjoy' });
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
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    if (phone) {
      const existingPhone = await User.findOne({ phone: phone.trim() });
      if (existingPhone) {
        return res.status(409).json({ error: 'Phone number already in use' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      phone: phone?.trim(),
      shippingAddress: shippingAddress || {},
      marketingOptIn: Boolean(marketingOptIn),
      role: 'customer',
      isActive: true
    });

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    logger.info('User registered', { userId: user._id, email: user.email });
    res.status(201).json({ success: true, token, refreshToken, user: { id: user._id, email: user.email, name: user.name, role: user.role, shippingAddress: user.shippingAddress || {}, phone: user.phone } });
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
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    logger.info('User logged in', { userId: user._id, email: user.email });
    res.json({ success: true, token, refreshToken, user: { id: user._id, email: user.email, name: user.name, role: user.role, shippingAddress: user.shippingAddress || {}, phone: user.phone } });
  } catch (err) {
    logger.error('Login failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'papjoy' });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    res.json({ token });
  } catch (err) {
    logger.warn('Refresh token invalid', { error: err.message });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

async function me(req, res) {
  try {
    const user = await User.findById(req.userId).select('-passwordHash -passwordResetToken -passwordResetExpires');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    logger.error('Fetch profile failed', { error: err.message });
    res.status(500).json({ error: 'Unable to fetch user profile' });
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
      return res.status(400).json({ error: 'Google token audience mismatch' });
    }

    const email = payload.email?.toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Google token missing email' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: payload.name || 'Google User',
        oauthProvider: 'google',
        oauthId: payload.sub,
        isActive: true,
        role: 'customer'
      });
    }

    const token = signToken({ id: user._id, email: user.email, type: 'access' }, JWT_SECRET, JWT_EXPIRE);
    const refreshToken = signToken({ id: user._id, type: 'refresh' }, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRE);

    res.json({ token, refreshToken, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    logger.error('Google authentication failed', { error: err.message });
    res.status(500).json({ error: 'Google authentication failed' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  const normalizedEmail = email.toLowerCase();
  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.json({ message: 'If that email is registered, password reset instructions will be sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${APP_URL}/reset-password.html?token=${resetToken}`;
    res.json({ message: 'Password reset token generated', resetToken, resetUrl });
  } catch (err) {
    logger.error('Password reset request failed', { error: err.message });
    res.status(500).json({ error: 'Unable to create password reset token' });
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
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    logger.error('Reset password failed', { error: err.message });
    res.status(500).json({ error: 'Unable to reset password' });
  }
}

function googleConfig(req, res) {
  res.json({ clientId: GOOGLE_CLIENT_ID });
}

async function updateProfile(req, res) {
  const updates = {};
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.email) {
      const email = req.body.email.toLowerCase();
      if (email !== user.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(409).json({ error: 'Email already in use' });
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
          return res.status(409).json({ error: 'Phone number already in use' });
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
    if (!updatedUser) return res.status(404).json({ error: 'Unable to update profile' });

    const responseUser = updatedUser.toObject();
    delete responseUser.passwordHash;
    delete responseUser.passwordResetToken;
    delete responseUser.passwordResetExpires;

    res.json(responseUser);
  } catch (err) {
    logger.error('Update profile failed', { error: err.message });
    res.status(500).json({ error: 'Unable to update profile' });
  }
}

async function logout(req, res) {
  logger.info('User logged out', { userId: req.userId });
  res.json({ message: 'Logged out successfully' });
}

// Address Management Functions
async function getAddresses(req, res) {
  try {
    const user = await User.findById(req.userId).select('addresses');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ addresses: user.addresses || [] });
  } catch (err) {
    logger.error('Fetch addresses failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
}

async function addAddress(req, res) {
  try {
    const { type, name, phone, street, city, state, zipCode, country, isDefault } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

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
    res.status(201).json(updated.addresses[updated.addresses.length - 1]);
  } catch (err) {
    logger.error('Add address failed', { error: err.message });
    res.status(500).json({ error: 'Failed to add address' });
  }
}

async function updateAddress(req, res) {
  try {
    const { addressId } = req.params;
    const updates = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const address = user.addresses?.find(a => a._id?.toString() === addressId);
    if (!address) return res.status(404).json({ error: 'Address not found' });

    // Update address fields
    Object.assign(address, updates);

    // If marking as default, unset other defaults of same type
    if (updates.isDefault === true) {
      user.addresses.forEach(addr => {
        if (addr.type === address.type && addr._id?.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    await user.save();
    res.json(address);
  } catch (err) {
    logger.error('Update address failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update address' });
  }
}

async function deleteAddress(req, res) {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const addressIndex = user.addresses?.findIndex(a => a._id?.toString() === addressId);
    if (addressIndex === -1 || addressIndex === undefined) {
      return res.status(404).json({ error: 'Address not found' });
    }

    user.addresses.splice(addressIndex, 1);
    await user.save();
    res.json({ message: 'Address deleted successfully' });
  } catch (err) {
    logger.error('Delete address failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete address' });
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
  deleteAddress
};
