const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

mongoose.connect(MONGO_URI).then(async () => {
  const count = await mongoose.connection.db.collection('products').countDocuments();
  console.log('Total products in database:', count);
  const products = await mongoose.connection.db.collection('products').find().limit(5).toArray();
  console.log('First 5 products:');
  products.forEach(p => console.log(`  - ${p.name} | ₹${p.price} | ${p.images?.[0]?.url || 'no image'}`));
  await mongoose.disconnect();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
