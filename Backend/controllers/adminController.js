const { User, Product, Order, Category, Invoice } = require('../models');
const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

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
    const [paymentRevenue, orderStatusBreakdown, invoiceStats] = await Promise.all([
      Order.aggregate([{ $group: { _id: '$paymentStatus', total: { $sum: '$total' }, gstTotal: { $sum: { $ifNull: ['$gstTotal', '$tax'] } }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$total' }, gstTotal: { $sum: '$taxTotal' } } }])
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
      totalUsers,
      totalOrders,
      totalProducts,
      totalRevenue,
      completedRevenue,
      pendingRevenue,
      refunds,
      gstCollected,
      invoiceCount,
      invoiceRevenue,
      averageOrderValue,
      orderStatusBreakdown: orderStatusBreakdown.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {})
    });
  } catch (err) {
    logger.error('Admin summary failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load admin summary' });
  }
}

async function getProducts(req, res) {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const query = {};
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
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
    const { page = 1, limit = 50, status, search = '' } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$or = [{ orderNumber: { $regex: search, $options: 'i' } }, { 'shippingAddress.name': { $regex: search, $options: 'i' } }, { 'billingAddress.name': { $regex: search, $options: 'i' } }];
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
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
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
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

module.exports = {
  getSummary,
  getProducts,
  getOrders,
  getUsers,
  getAnalytics,
  getAdminCategories,
  getReports
};
