/**
 * Bulk upload footwear products to PapJoy backend
 * Run: node upload-products.js
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'papp.joyy@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'papjoy123';

const IMAGES_DIR = path.join(__dirname, '..', 'frontend', 'public', 'images', 'products');

async function login() {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.token || data.data?.token;
}

async function getCategories(token) {
  const res = await fetch(`${API_URL}/api/v1/categories`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  const data = await res.json();
  return data.data || data;
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  // Read all images
  const images = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.jpg'));
  console.log(`Found ${images.length} images`);

  // Login
  console.log('Logging in...');
  const token = await login();
  console.log('Logged in successfully');

  // Get categories
  console.log('Fetching categories...');
  const categories = await getCategories(token);
  console.log(`Found ${categories.length} categories`);

  // Use first category or create a default one
  let categoryId;
  if (categories.length > 0) {
    categoryId = categories[0]._id || categories[0].id;
  } else {
    console.log('No categories found, creating "Footwear" category...');
    const catRes = await fetch(`${API_URL}/api/v1/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Footwear', slug: 'footwear', description: 'Footwear products' })
    });
    const catData = await catRes.json();
    categoryId = catData._id || catData.data?._id;
  }

  // Build products
  const products = images.map((img, i) => {
    const baseName = img.replace('.jpg', '');
    const name = baseName
      .replace(/WhatsApp Image /g, '')
      .replace(/[\d-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      name: `Footwear ${i + 1}`,
      slug: generateSlug(`footwear-${i + 1}`),
      description: `High quality footwear. Product #${i + 1}.`,
      price: 999 + (i * 100),
      categoryId,
      images: [{
        url: `/images/products/${img}`,
        alt: `Footwear ${i + 1}`,
        isPrimary: true
      }],
      inventory: { quantity: 50, lowStockThreshold: 10 },
      isActive: true,
      tags: ['footwear', 'shoes']
    };
  });

  console.log(`Uploading ${products.length} products...`);

  // Bulk upload
  const res = await fetch(`${API_URL}/api/v1/products/bulk-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ products })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const result = await res.json();
  console.log(`Success! Created ${result.created} products`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
