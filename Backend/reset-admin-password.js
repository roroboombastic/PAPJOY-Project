const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MONGO_URI } = require('./config');

const ADMIN_EMAIL = 'papp.joyy@gmail.com';
const NEW_PASSWORD = 'papjoy123';

mongoose.connect(MONGO_URI).then(async () => {
  const user = await mongoose.connection.db.collection('users').findOne({ email: ADMIN_EMAIL });
  if (!user) {
    console.error('Admin user not found');
    process.exit(1);
  }
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, salt);
  await mongoose.connection.db.collection('users').updateOne(
    { email: ADMIN_EMAIL },
    { $set: { passwordHash } }
  );
  console.log('Password reset successfully for', ADMIN_EMAIL);
  await mongoose.disconnect();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
