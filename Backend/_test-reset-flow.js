const crypto = require('crypto');
process.chdir('C:/Users/arikta/Desktop/PAPJOY - Copy - Copy - Copy/Backend');
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const config = require('./config');
const { User } = require('./models');

(async () => {
  await mongoose.connect(config.MONGO_URI);
  const email = 'testverify@example.com';
  const user = await User.findOne({ email });
  if (!user) { console.log('USER NOT FOUND'); process.exit(1); }

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.passwordResetExpires = Date.now() + 3600 * 1000;
  await user.save({ validateBeforeSave: false });
  console.log('RAW_TOKEN=' + rawToken);
  process.exit(0);
})();
