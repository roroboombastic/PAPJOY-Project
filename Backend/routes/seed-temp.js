const express = require('express');
const router = express.Router();
const { Category, Product } = require('../models');
const logger = require('../utils/logger');

const SEED_SECRET = 'papjoy-seed-2024-temp';

const categories = [
  { name: 'Sneakers', slug: 'sneakers', description: 'Everyday sneakers for casual wear', sortOrder: 1 },
  { name: 'Running', slug: 'running', description: 'Performance running shoes', sortOrder: 2 },
  { name: 'Boots', slug: 'boots', description: 'Durable boots for all terrains', sortOrder: 3 },
  { name: 'Loafers', slug: 'loafers', description: 'Classic loafers for smart casual looks', sortOrder: 4 },
];

const products = [
  {
    name: 'Sage Runner', slug: 'sage-runner',
    description: 'Lightweight mesh upper with responsive foam midsole. Built for daily runs and all-day comfort.',
    shortDescription: 'Lightweight running shoe with responsive foam',
    price: 4999, comparePrice: 6499, brand: 'PAP-JOY', sku: 'PJSR001', gstPercentage: 18,
    inventory: { quantity: 50, lowStockThreshold: 10, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop', alt: 'Sage Runner', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=600&h=600&fit=crop', alt: 'Sage Runner side' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 12, sku: 'PJSR001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 15, sku: 'PJSR001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 13, sku: 'PJSR001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 10, sku: 'PJSR001-10' },
    ],
    tags: ['sneakers', 'running', 'lightweight', 'featured'], isFeatured: true, categorySlug: 'running',
  },
  {
    name: 'Forest Trail Boot', slug: 'forest-trail-boot',
    description: 'Waterproof leather upper with rugged rubber outsole. Perfect for trails and urban exploration.',
    shortDescription: 'Waterproof trail boot with rugged grip',
    price: 7999, comparePrice: 9999, brand: 'PAP-JOY', sku: 'PJFT001', gstPercentage: 18,
    inventory: { quantity: 30, lowStockThreshold: 8, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&h=600&fit=crop', alt: 'Forest Trail Boot', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop', alt: 'Forest Trail Boot detail' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 8, sku: 'PJFT001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 10, sku: 'PJFT001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 7, sku: 'PJFT001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 5, sku: 'PJFT001-10' },
    ],
    tags: ['boots', 'waterproof', 'trail', 'featured'], isFeatured: true, categorySlug: 'boots',
  },
  {
    name: 'Urban Loafer', slug: 'urban-loafer',
    description: 'Premium suede upper with cushioned insole. Effortless style for work and weekends.',
    shortDescription: 'Premium suede loafer with cushioned insole',
    price: 3999, comparePrice: 5499, brand: 'PAP-JOY', sku: 'PJUL001', gstPercentage: 18,
    inventory: { quantity: 40, lowStockThreshold: 10, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=600&h=600&fit=crop', alt: 'Urban Loafer', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600&h=600&fit=crop', alt: 'Urban Loafer side' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 10, sku: 'PJUL001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 12, sku: 'PJUL001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 10, sku: 'PJUL001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 8, sku: 'PJUL001-10' },
    ],
    tags: ['loafers', 'suede', 'casual', 'new'], isFeatured: false, categorySlug: 'loafers',
  },
  {
    name: 'Cloud Walker', slug: 'cloud-walker',
    description: 'Ultra-light foam construction with breathable knit upper. Walk on clouds all day long.',
    shortDescription: 'Ultra-light foam shoe with breathable knit',
    price: 3499, comparePrice: 4999, brand: 'PAP-JOY', sku: 'PJCW001', gstPercentage: 18,
    inventory: { quantity: 60, lowStockThreshold: 10, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600&h=600&fit=crop', alt: 'Cloud Walker', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&h=600&fit=crop', alt: 'Cloud Walker detail' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 15, sku: 'PJCW001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 18, sku: 'PJCW001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 15, sku: 'PJCW001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 12, sku: 'PJCW001-10' },
    ],
    tags: ['sneakers', 'lightweight', 'comfort', 'featured', 'new'], isFeatured: true, categorySlug: 'sneakers',
  },
  {
    name: 'Midnight Sprint', slug: 'midnight-sprint',
    description: 'Bold design meets speed. Carbon fiber plate technology for explosive energy return.',
    shortDescription: 'High-performance sprint shoe with carbon plate',
    price: 8999, comparePrice: 11999, brand: 'PAP-JOY', sku: 'PJMS001', gstPercentage: 18,
    inventory: { quantity: 25, lowStockThreshold: 5, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&h=600&fit=crop', alt: 'Midnight Sprint', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop', alt: 'Midnight Sprint angle' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 6, sku: 'PJMS001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 8, sku: 'PJMS001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 6, sku: 'PJMS001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 5, sku: 'PJMS001-10' },
    ],
    tags: ['running', 'performance', 'carbon', 'featured'], isFeatured: true, categorySlug: 'running',
  },
  {
    name: 'Classic Canvas', slug: 'classic-canvas',
    description: 'Timeless canvas sneaker with vulcanized rubber sole. Simple, clean, and endlessly versatile.',
    shortDescription: 'Timeless canvas sneaker with clean design',
    price: 2499, comparePrice: 3499, brand: 'PAP-JOY', sku: 'PJCC001', gstPercentage: 18,
    inventory: { quantity: 80, lowStockThreshold: 15, trackInventory: true },
    images: [
      { url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&h=600&fit=crop', alt: 'Classic Canvas', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop', alt: 'Classic Canvas side' }
    ],
    variants: [
      { name: 'Size', value: 'UK 7', priceModifier: 0, inventory: 20, sku: 'PJCC001-7' },
      { name: 'Size', value: 'UK 8', priceModifier: 0, inventory: 22, sku: 'PJCC001-8' },
      { name: 'Size', value: 'UK 9', priceModifier: 0, inventory: 20, sku: 'PJCC001-9' },
      { name: 'Size', value: 'UK 10', priceModifier: 0, inventory: 18, sku: 'PJCC001-10' },
    ],
    tags: ['sneakers', 'canvas', 'classic', 'new'], isFeatured: false, categorySlug: 'sneakers',
  },
];

router.post('/seed', async (req, res) => {
  try {
    if (req.body.secret !== SEED_SECRET) {
      return res.status(403).json({ error: 'Invalid seed secret' });
    }

    await Category.deleteMany({});
    await Product.deleteMany({});

    const createdCategories = {};
    for (const cat of categories) {
      const doc = await Category.create(cat);
      createdCategories[cat.slug] = doc._id;
    }

    let productCount = 0;
    for (const prod of products) {
      const categoryId = createdCategories[prod.categorySlug];
      if (!categoryId) continue;
      const { categorySlug, ...productData } = prod;
      await Product.create({ ...productData, categoryId });
      productCount++;
    }

    logger.info('Database seeded via temporary endpoint');
    res.json({ success: true, categories: categories.length, products: productCount });
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
    res.status(500).json({ error: 'Seed failed', details: err.message });
  }
});

module.exports = router;
