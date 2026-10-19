const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

mongoose.connect(MONGO_URI).then(async () => {
  const users = await mongoose.connection.db.collection('users').find({ role: { $in: ['admin', 'super_admin'] } }).toArray();
  console.log('Admin users:', JSON.stringify(users.map(u => ({ email: u.email, role: u.role })), null, 2));
  await mongoose.disconnect();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
