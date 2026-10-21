/**
 * Improve the 30 footwear products:
 * - Proper product names (instead of "Footwear 1", "Footwear 2"...)
 * - Real descriptions
 * - Sensible prices by type
 * - SEO titles/descriptions
 * - Assign correct categories
 */
const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

// Category IDs (from database).
// These MUST be ObjectId instances, not strings: this script writes through the
// raw driver (`db.collection('products').updateOne`), which bypasses Mongoose
// casting. A raw string here would be stored as a BSON string while the Product
// schema declares `categoryId` as an ObjectId - populate() hides the mismatch but
// every ObjectId-filtered query silently misses those documents.
const CATEGORY = {
  heels: new mongoose.Types.ObjectId('6a6cc1960175df8439a16764'),
  flat: new mongoose.Types.ObjectId('6a6cc32e0175df8439a16765'),
};

const STYLES = [
  { type: 'heel', name: 'Papjoy Women\'s Block Heel Sandal', price: 1299, cat: CATEGORY.heels },
  { type: 'heel', name: 'Papjoy Women\'s Party Heel Sandal', price: 1599, cat: CATEGORY.heels },
  { type: 'heel', name: 'Papjoy Women\'s Ankle-Strap Heel', price: 1499, cat: CATEGORY.heels },
  { type: 'flat', name: 'Papjoy Women\'s Flat Sandal', price: 699, cat: CATEGORY.flat },
  { type: 'flat', name: 'Papjoy Women\'s Casual Sandal', price: 799, cat: CATEGORY.flat },
  { type: 'flat', name: 'Papjoy Women\'s Everyday Footwear', price: 649, cat: CATEGORY.flat },
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const DESCRIPTIONS = {
  heel: [
    'Step out in confident style with these elegant Papjoy block heels. Designed for all-day comfort with a cushioned footbed, stable heel height, and a secure ankle strap that keeps you supported from morning to evening.',
    'Turn heads with these chic Papjoy party heels. Featuring a sleek silhouette, soft insole padding, and a durable anti-slip sole — perfect for weddings, dinners, and festive occasions.',
  ],
  flat: [
    'Keep it comfortable and effortless with these Papjoy flat sandals. Lightweight, breathable, and easy to slip on, they are ideal for daily wear, casual outings, and relaxed weekends.',
    'Everyday comfort meets everyday style. These Papjoy casual sandals feature a soft cushioned footbed and a durable sole, making them a versatile addition to your wardrobe.',
  ],
};

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const products = await db.collection('products').find({ slug: { $regex: '^footwear-' } }).toArray();
  console.log(`Found ${products.length} footwear products to update\n`);

  let i = 0;
  for (const p of products) {
    const style = STYLES[i % STYLES.length];
    const desc = DESCRIPTIONS[style.type][Math.floor(i / STYLES.length) % DESCRIPTIONS[style.type].length];

    const update = {
      name: style.name,
      slug: slugify(`${style.name}-${i + 1}`),
      description: desc,
      shortDescription: desc.split('. ')[0] + '.',
      price: style.price,
      comparePrice: 0,
      categoryId: style.cat,
      isActive: true,
      seo: {
        title: `${style.name} | PAP-JOY`,
        description: `Buy ${style.name} online at PAP-JOY. Comfortable, durable and stylish women's footwear with easy returns and fast delivery.`,
        keywords: [style.name.toLowerCase(), 'women footwear', 'papjoy shoes', 'buy online'],
      },
      tags: ['women', 'footwear', style.type, 'papjoy'],
    };

    await db.collection('products').updateOne({ _id: p._id }, { $set: update });
    console.log(`OK: ${p.name} -> ${update.name} (₹${update.price})`);
    i++;
  }

  console.log(`\nUpdated ${products.length} products`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
