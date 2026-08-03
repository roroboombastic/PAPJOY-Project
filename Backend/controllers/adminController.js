const { User, Product, Order, Category, Invoice, Shipment } = require('../models');
const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateEan13Barcode() {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

async function uploadFiles(req, res) {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files provided. Upload at least one image.' });
    }
    const files = req.files.map(file => ({
      url: `/uploads/products/${file.filename}`,
      isVideo: /\.(mp4|webm|mov)$/i.test(file.originalname)
    }));
    res.status(201).json({ files });
  } catch (err) {
    logger.error('Upload files failed', { error: err.message });
    res.status(500).json({ error: 'Failed to upload files' });
  }
}

function getRangeBounds(range = 'month', from, to) {
  const end = to ? new Date(to) : new Date();
  let start;
  switch (String(range || '').toLowerCase()) {
    case 'today':
      start = new Date(end);
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      break;
    case 'year':
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'custom':
      start = from ? new Date(from) : new Date(0);
      break;
    case 'month':
    default:
      start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      break;
  }
  if (Number.isNaN(start.getTime())) start = new Date(0);
  if (Number.isNaN(end.getTime())) return { start: new Date(0), end: new Date() };
  return { start, end };
}

function formatCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildReportRows(orders = []) {
  return orders.map((order) => ({
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total || 0,
    gstTotal: order.gstTotal || order.tax || 0,
    createdAt: order.createdAt,
    customer: order.shippingAddress?.name || order.billingAddress?.name || 'Guest'
  }));
}

async function getSummary(req, res) {
  try {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const [paymentRevenue, orderStatusBreakdown, invoiceStats, recentOrders] = await Promise.all([
      Order.aggregate([{ $group: { _id: '$paymentStatus', total: { $sum: '$total' }, gstTotal: { $sum: { $ifNull: ['$gstTotal', '$tax'] } }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$total' }, gstTotal: { $sum: '$taxTotal' } } }]),
      Order.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'name email')
    ]);

    const totalRevenue = paymentRevenue.find((item) => item._id === 'paid')?.total || 0;
    const completedRevenue = totalRevenue;
    const pendingRevenue = paymentRevenue.filter((item) => ['pending', 'confirmed'].includes(item._id)).reduce((sum, item) => sum + item.total, 0);
    const refunds = paymentRevenue.find((item) => item._id === 'refunded')?.total || 0;
    const gstCollected = paymentRevenue.find((item) => item._id === 'paid')?.gstTotal || 0;
    const invoiceCount = invoiceStats.reduce((sum, item) => sum + item.count, 0);
    const invoiceRevenue = invoiceStats.reduce((sum, item) => sum + item.total, 0);
    const averageOrderValue = totalOrders ? Number((completedRevenue / totalOrders).toFixed(2)) : 0;

    res.json({
      stats: { totalUsers, totalOrders, totalProducts, totalRevenue, averageOrderValue },
      recentOrders,
      ordersByStatus: orderStatusBreakdown.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      totalRevenue,
      completedRevenue,
      pendingRevenue,
      refunds,
      gstCollected,
      invoiceCount,
      invoiceRevenue
    });
  } catch (err) {
    logger.error('Admin summary failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load admin summary' });
  }
}

async function getProducts(req, res) {
  try {
    const { page = 1, limit = 50, search = '', status = 'all' } = req.query;
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [{ name: { $regex: safeSearch, $options: 'i' } }, { slug: { $regex: safeSearch, $options: 'i' } }, { sku: { $regex: safeSearch, $options: 'i' } }];
    }
    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;
    const products = await Product.find(query).sort({ createdAt: -1 }).limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
    const total = await Product.countDocuments(query);
    res.json({ products, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Admin products failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load products' });
  }
}

async function getOrders(req, res) {
  try {
    const { page = 1, limit = 50, status, search = '', sort = 'newest' } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [{ orderNumber: { $regex: safeSearch, $options: 'i' } }, { 'shippingAddress.name': { $regex: safeSearch, $options: 'i' } }, { 'billingAddress.name': { $regex: safeSearch, $options: 'i' } }];
    }
    let sortObj = { createdAt: -1 };
    if (sort === 'oldest') sortObj = { createdAt: 1 };
    else if (sort === 'highest-value') sortObj = { total: -1 };
    else if (sort === 'lowest-value') sortObj = { total: 1 };
    const orders = await Order.find(query).populate('userId', 'name email').sort(sortObj).limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
    const total = await Order.countDocuments(query);
    res.json({ orders, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Admin orders failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load orders' });
  }
}

async function getUsers(req, res) {
  try {
    const { page = 1, limit = 50, search = '', role = 'all' } = req.query;
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [{ name: { $regex: safeSearch, $options: 'i' } }, { email: { $regex: safeSearch, $options: 'i' } }];
    }
    if (role !== 'all') query.role = role;
    const users = await User.find(query).select('-passwordHash -passwordResetToken -passwordResetExpires').sort({ createdAt: -1 }).limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
    const total = await User.countDocuments(query);
    res.json({ users, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Admin users failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load users' });
  }
}

async function getAnalytics(req, res) {
  try {
    const { range = 'month', from, to } = req.query;
    const { start: rangeStart, end: rangeEnd } = getRangeBounds(range, from, to);
    const revenueByDate = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const topProducts = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
      { $sort: { quantity: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
    ]);

    const categorySales = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'categories', localField: 'product.categoryId', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$category._id', name: { $first: '$category.name' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    const orderStats = await Order.aggregate([
      { $match: { createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const paymentMethodStats = await Order.aggregate([
      { $match: { createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$total' } } }
    ]);

    const shippingStatusStats = await Order.aggregate([
      { $match: { createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
      { $group: { _id: '$shipment.status', count: { $sum: 1 } } }
    ]);

    res.json({
      revenueByDate,
      topProducts: topProducts.map((p) => ({ _id: p._id, product: p.product, quantity: p.quantity, revenue: p.revenue })),
      categorySales,
      orderStats: orderStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      paymentMethodStats: paymentMethodStats.reduce((acc, item) => ({ ...acc, [item._id]: { count: item.count, revenue: item.revenue } }), {}),
      shippingStatusStats: shippingStatusStats.reduce((acc, item) => ({ ...acc, [item._id || 'unknown']: item.count }), {})
    });
  } catch (err) {
    logger.error('Admin analytics failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load analytics' });
  }
}

async function getReports(req, res) {
  try {
    const { range = 'month', from, to, format = 'json' } = req.query;
    const { start, end } = getRangeBounds(range, from, to);
    const orders = await Order.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 }).lean();
    const rows = buildReportRows(orders);
    const summary = rows.reduce((acc, row) => {
      const completed = row.paymentStatus === 'paid';
      const refunded = row.paymentStatus === 'refunded';
      acc.orders += 1;
      acc.revenue += completed ? row.total : 0;
      acc.pendingRevenue += row.paymentStatus === 'pending' || row.paymentStatus === 'confirmed' ? row.total : 0;
      acc.refunds += refunded ? row.total : 0;
      acc.gstCollected += completed ? row.gstTotal : 0;
      return acc;
    }, { orders: 0, revenue: 0, pendingRevenue: 0, refunds: 0, gstCollected: 0 });

    if (format === 'csv') {
      const csv = [
        ['Order Number', 'Customer', 'Status', 'Payment Status', 'Total', 'GST', 'Created At'].map(formatCsvValue).join(','),
        ...rows.map((row) => [row.orderNumber, row.customer, row.status, row.paymentStatus, row.total, row.gstTotal, row.createdAt?.toISOString?.() || row.createdAt].map(formatCsvValue).join(','))
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="papjoy-report-${range}.csv"`);
      return res.send(csv);
    }

    if (format === 'pdf') {
      const pdf = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers = [];
      pdf.on('data', (chunk) => buffers.push(chunk));
      pdf.on('end', () => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="papjoy-report-${range}.pdf"`);
        res.send(Buffer.concat(buffers));
      });

      pdf.fontSize(18).font('Helvetica-Bold').text('PAP-JOY Financial Report', { align: 'center' });
      pdf.moveDown(0.5);
      pdf.fontSize(10).font('Helvetica').text(`Range: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`, { align: 'center' });
      pdf.moveDown();
      pdf.fontSize(11).font('Helvetica-Bold').text(`Orders: ${summary.orders}`);
      pdf.text(`Revenue: ₹${summary.revenue.toLocaleString('en-IN')}`);
      pdf.text(`GST Collected: ₹${summary.gstCollected.toLocaleString('en-IN')}`);
      pdf.text(`Pending Revenue: ₹${summary.pendingRevenue.toLocaleString('en-IN')}`);
      pdf.text(`Refunds: ₹${summary.refunds.toLocaleString('en-IN')}`);
      pdf.moveDown();
      pdf.fontSize(10).text('Recent orders', { underline: true });
      rows.slice(0, 25).forEach((row) => {
        pdf.fontSize(9).text(`${row.orderNumber} | ${row.customer} | ${row.status} | ₹${row.total.toLocaleString('en-IN')} | GST ₹${row.gstTotal.toLocaleString('en-IN')}`);
      });
      pdf.end();
      return;
    }

    res.json({
      range: { start, end },
      summary,
      orders: rows
    });
  } catch (err) {
    logger.error('Admin reports failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load report' });
  }
}

async function getAdminCategories(req, res) {
  try {
    const categories = await Category.find().sort({ sortOrder: 1 });
    res.json(categories);
  } catch (err) {
    logger.error('Admin categories failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load categories' });
  }
}

async function createProduct(req, res) {
  try {
    const parseJsonField = (val) => {
      if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
      return val;
    };

    const body = { ...req.body };
    ['images', 'videos', 'inventory', 'seo', 'tags', 'attributes', 'variants'].forEach(key => {
      if (body[key]) body[key] = parseJsonField(body[key]);
    });
    if (typeof body.isActive === 'string') body.isActive = body.isActive === 'true';
    if (typeof body.isFeatured === 'string') body.isFeatured = body.isFeatured === 'true';
    if (typeof body.price === 'string') body.price = Number(body.price);
    if (typeof body.comparePrice === 'string') body.comparePrice = Number(body.comparePrice);
    if (typeof body.costPrice === 'string') body.costPrice = Number(body.costPrice);
    if (typeof body.gstPercentage === 'string') body.gstPercentage = Number(body.gstPercentage);

    const { name, slug, description, price, categoryId, sku, brand, inventory, isActive, isFeatured, tags, images, videos } = body;

    if (isActive !== false && !categoryId) {
      return res.status(400).json({ error: 'Category is required to publish a product. Select a category or save as a draft.' });
    }

    const productSlug = slug || (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const imageUrls = [];
    const videoUrls = [];

    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const fileUrl = `/uploads/products/${file.filename}`;
        const isVideo = /\.(mp4|webm|mov)$/i.test(file.originalname);
        if (isVideo) videoUrls.push(fileUrl);
        else imageUrls.push({ url: fileUrl, alt: name || '', isPrimary: imageUrls.length === 0 });
      });
    }

    const bodyImages = Array.isArray(images) ? images.map(img => {
      if (typeof img === 'string') return { url: img, alt: name || '', isPrimary: false };
      return img;
    }) : [];
    const bodyVideos = Array.isArray(videos) ? videos.filter(Boolean) : [];

    const product = await Product.create({
      ...body,
      slug: productSlug,
      images: [...imageUrls, ...bodyImages],
      videos: [...videoUrls, ...bodyVideos]
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Product with this slug or SKU already exists' });
    }
    logger.error('Create product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  try {
    const parseJsonField = (val) => {
      if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
      return val;
    };

    const updateData = { ...req.body };
    delete updateData._id;

    ['images', 'videos', 'inventory', 'seo', 'tags', 'attributes', 'variants'].forEach(key => {
      if (updateData[key]) updateData[key] = parseJsonField(updateData[key]);
    });
    if (typeof updateData.isActive === 'string') updateData.isActive = updateData.isActive === 'true';
    if (typeof updateData.isFeatured === 'string') updateData.isFeatured = updateData.isFeatured === 'true';
    ['price', 'comparePrice', 'costPrice', 'gstPercentage'].forEach(key => {
      if (typeof updateData[key] === 'string') updateData[key] = Number(updateData[key]);
    });

    if (updateData.name && !updateData.slug) {
      updateData.slug = updateData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    if (req.files && req.files.length > 0) {
      const newImages = [];
      const newVideos = [];
      req.files.forEach(file => {
        const fileUrl = `/uploads/products/${file.filename}`;
        const isVideo = /\.(mp4|webm|mov)$/i.test(file.originalname);
        if (isVideo) newVideos.push(fileUrl);
        else newImages.push({ url: fileUrl, alt: updateData.name || '', isPrimary: false });
      });

      const bodyImages = Array.isArray(updateData.images) ? updateData.images.map(img => {
        if (typeof img === 'string') return { url: img, alt: updateData.name || '', isPrimary: false };
        return img;
      }) : [];

      updateData.images = [...newImages, ...bodyImages];
      if (newVideos.length > 0) {
        const existingVideos = Array.isArray(updateData.videos) ? updateData.videos.filter(Boolean) : [];
        updateData.videos = [...newVideos, ...existingVideos];
      }
    }

    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    if (updateData.isActive === true && !(updateData.categoryId || existing.categoryId)) {
      return res.status(400).json({ error: 'Category is required to publish a product. Select a category or save as a draft.' });
    }

    if (!updateData.barcode && !existing.barcode) {
      updateData.barcode = generateEan13Barcode();
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    res.json(product);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Product with this slug or SKU already exists' });
    }
    logger.error('Update product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    logger.error('Delete product failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, trackingNumber, note, carrier } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (status) order.status = status;

    if (!order.shipment) order.shipment = {};
    if (trackingNumber) order.shipment.trackingNumber = trackingNumber;
    if (carrier) order.shipment.carrier = carrier;
    if (status) order.shipment.status = status;

    if (!order.shipment.events) order.shipment.events = [];
    order.shipment.events.push({
      timestamp: new Date(),
      status: status || order.status,
      message: note || `Status updated to ${status || order.status}`,
      location: ''
    });

    if (status === 'delivered') order.paymentStatus = 'paid';

    await order.save();

    const customerEmail = order.deliveryInfo?.email || order.billingAddress?.email || order.shippingAddress?.email || '';
    if (customerEmail && status) {
      const emailService = require('../services/emailService');
      emailService.sendMail({
        to: customerEmail,
        ...emailService.orderUpdateTemplate(order)
      });
    }

    const shipmentOrder = await Shipment.findOne({ orderId: id });
    if (shipmentOrder) {
      if (status) shipmentOrder.status = status;
      if (trackingNumber) shipmentOrder.trackingNumber = trackingNumber;
      if (carrier) shipmentOrder.carrier = carrier;
      shipmentOrder.events.push({
        timestamp: new Date(),
        status: status || shipmentOrder.status,
        message: note || `Status updated to ${status || shipmentOrder.status}`,
        location: ''
      });
      await shipmentOrder.save();
    }

    res.json(order);
  } catch (err) {
    logger.error('Update order status failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update order status' });
  }
}

async function createCategory(req, res) {
  try {
    const { name, slug, description, image, isActive, sortOrder, parentId } = req.body;
    const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const category = await Category.create({ ...req.body, slug: categorySlug });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Category with this name or slug already exists' });
    }
    logger.error('Create category failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create category' });
  }
}

async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData._id;

    if (req.body.name && !req.body.slug) {
      updateData.slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const category = await Category.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Category with this name or slug already exists' });
    }
    logger.error('Update category failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update category' });
  }
}

async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const productCount = await Product.countDocuments({ categoryId: id });
    if (productCount > 0) {
      return res.status(409).json({ error: `Cannot delete category: ${productCount} product(s) reference it. Reassign or remove them first.` });
    }

    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    logger.error('Delete category failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete category' });
  }
}

async function getProductById(req, res) {
  try {
    const product = await Product.findById(req.params.id).populate('categoryId', 'name slug');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    logger.error('Get product by ID failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load product' });
  }
}

async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (String(user._id) === String(req.userId)) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    user.isActive = isActive;
    await user.save();

    const safeUser = user.toObject();
    delete safeUser.passwordHash;
    delete safeUser.passwordResetToken;
    delete safeUser.passwordResetExpires;

    res.json(safeUser);
  } catch (err) {
    logger.error('Update user status failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update user status' });
  }
}

async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['customer', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    if (String(id) === String(req.userId)) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select('-passwordHash -passwordResetToken -passwordResetExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    logger.error('Update user role failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update user role' });
  }
}

async function getCategoryById(req, res) {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    logger.error('Get category by ID failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load category' });
  }
}

module.exports = {
  uploadFiles,
  getSummary,
  getProducts,
  getOrders,
  getUsers,
  getAnalytics,
  getAdminCategories,
  getReports,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  updateOrderStatus,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
  updateUserRole,
  updateUserStatus
};
