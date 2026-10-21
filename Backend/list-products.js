const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

mongoose.connect(MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  const products = await db.collection('products').find().toArray();
  console.log('TOTAL PRODUCTS:', products.length);
  console.log('\n--- CATEGORIES ---');
  const cats = await db.collection('categories').find().toArray();
  cats.forEach(c => console.log(`${c._id} | ${c.name} | ${c.slug}`));
  console.log('\n--- PRODUCTS ---');
  products.forEach(p => {
    console.log(`${p.name} | ₹${p.price} | ${p.slug} | ${p.description}`);
  });
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
