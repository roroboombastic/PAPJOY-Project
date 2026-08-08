const { Order, Product, Notification, Cart, Shipment, User } = require('../models');
const logger = require('../utils/logger');
const { calculateOrderTotals, GST_STATE } = require('../utils/gst');
const emailService = require('./emailService');
const config = require('../config');
const shiprocketService = require('./shiprocketService');
const { ADMIN_EMAILS } = require('../config');
let sseManager;
try { sseManager = require('../utils/sse').sseManager; } catch (_) { /* SSE optional */ }

async function sendOrderEmails(order, userId) {
  let customerEmail = order.deliveryInfo?.email || order.shippingAddress?.email;
  if (!customerEmail && userId) {
    try {
      const user = await User.findById(userId).select('email');
      customerEmail = user?.email;
    } catch (_) { /* ignore */ }
  }
  if (customerEmail) {
    emailService.sendMail({
      to: customerEmail,
      ...emailService.orderConfirmationTemplate(order)
    });
  }
  const adminEmails = ADMIN_EMAILS.length ? ADMIN_EMAILS : ['papp.joyy@gmail.com'];
  adminEmails.forEach((adminEmail) => {
    emailService.sendMail({
      to: adminEmail,
      subject: `New Order #${order.orderNumber || order._id} — ₹${(order.total || order.amount || 0).toFixed(2)}`,
      html: `<p>A new order has been placed.</p><p>Order: #${order.orderNumber || order._id}</p><p>Amount: ₹${(order.total || order.amount || 0).toFixed(2)}</p>`
    });
  });
}

function createOrderNumber() {
  return `PJ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

async function buildOrderLineItems(items = [], deliveryInfo = {}) {
  const lineItems = [];
  const productIds = items.map(item => item.productId || item.id).filter(Boolean);
  const products = productIds.length ? await Product.find({ _id: { $in: productIds } }).lean() : [];
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const productId = item.productId || item.id || null;
    if (!productId) throw new Error('Order item must include a valid product id');
    const product = productMap.get(productId.toString());
    const price = Number(item.price || product?.price || 0);
    if (price < 0) continue;
    const itemTotal = quantity * price;

    lineItems.push({
      productId: product ? product._id : productId,
      name: item.name || product?.name || 'Item',
      variant: item.variant || 'Standard',
      quantity,
      price,
      unitPrice: price,
      total: itemTotal,
      gstRate: 0,
      shippingCharge: Number(product?.shippingCharge ?? item.shippingCharge ?? 0),
      weight: Number(product?.weight ?? item.weight ?? 0),
      length: Number(product?.length ?? item.length ?? 0),
      breadth: Number(product?.breadth ?? item.breadth ?? 0),
      height: Number(product?.height ?? item.height ?? 0),
      hsnCode: product?.hsnCode || item.hsnCode || '',
      cgst: 0,
      sgst: 0,
      igst: 0
    });
  }
  return lineItems;
}

async function adjustInventory(items = [], { operation = 'decrement', reference = '', note: movementNote = '' } = {}) {
  const direction = operation === 'increment' ? 1 : -1;
  const productIds = items.map(item => item.productId || item.id).filter(Boolean);
  if (!productIds.length) return;

  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  const updates = [];
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const productId = item.productId || item.id;
    if (!productId) continue;

    const product = productMap.get(productId.toString());
    if (!product || !product.inventory?.trackInventory) continue;

    const quantityChange = direction * quantity;
    const movement = {
      quantity: quantityChange,
      type: operation === 'increment' ? 'inbound' : 'outbound',
      reference,
      note: movementNote || `Inventory ${operation} for order ${reference}`
    };

    const variantKey = String(item.variant || '').trim().toLowerCase();
    let variantIndex = -1;
    if (Array.isArray(product.variants)) {
      variantIndex = product.variants.findIndex((v) => {
        const name = String(v.name || '').toLowerCase();
        const value = String(v.value || '').toLowerCase();
        const sku = String(v.sku || '').toLowerCase();
        return variantKey && (variantKey === name || variantKey === value || variantKey === sku);
      });
    }

    const matchCondition = { _id: productId };
    let incField;

    if (variantIndex >= 0 && typeof product.variants[variantIndex].inventory === 'number') {
      if (operation === 'decrement') {
        matchCondition[`variants.${variantIndex}.inventory`] = { $gte: quantity };
      }
      incField = `variants.${variantIndex}.inventory`;
    } else {
      if (operation === 'decrement') {
        matchCondition['inventory.quantity'] = { $gte: quantity };
      }
      incField = 'inventory.quantity';
    }

    const warehouseEntries = Array.isArray(product.warehouseInventory) ? product.warehouseInventory : [];
    if (warehouseEntries.length > 0 && operation === 'decrement') {
      const totalWarehouseQty = warehouseEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
      if (totalWarehouseQty < quantity) {
        const variantLabel = variantIndex >= 0
          ? ` (${product.variants[variantIndex].name || product.variants[variantIndex].value})`
          : '';
        throw new Error(`Insufficient warehouse stock for ${product.name}${variantLabel}`);
      }
    }

    const updateOps = {
      $inc: { [incField]: quantityChange },
      $push: { stockMovements: movement }
    };

    const updatePromise = Product.findOneAndUpdate(matchCondition, updateOps, { new: true })
      .then((updatedProduct) => {
        if (!updatedProduct && operation === 'decrement') {
          const variantLabel = variantIndex >= 0
            ? ` (${product.variants[variantIndex].name || product.variants[variantIndex].value})`
            : '';
          throw new Error(`Insufficient stock for ${product.name}${variantLabel}`);
        }
        return updatedProduct;
      });

    updates.push(updatePromise);

    for (const entry of warehouseEntries) {
      const warehouseMatch = { _id: productId, 'warehouseInventory.warehouseId': entry.warehouseId };
      const warehouseUpdate = {
        $inc: { 'warehouseInventory.$.quantity': quantityChange },
        $push: {
          stockMovements: {
            ...movement,
            warehouseId: entry.warehouseId
          }
        }
      };

      updates.push(
        Product.findOneAndUpdate(warehouseMatch, warehouseUpdate, { new: true })
          .catch(() => null)
      );
    }
  }

  await Promise.all(updates);
}

async function restoreInventoryForOrder(order) {
  if (!order) {
    return false;
  }
  const targetOrder = typeof order === 'string' ? await Order.findById(order).lean() : order;
  if (!targetOrder || !Array.isArray(targetOrder.items) || !targetOrder.items.length) {
    return false;
  }
  try {
    await adjustInventory(targetOrder.items, {
      operation: 'increment',
      reference: targetOrder.orderNumber || String(targetOrder._id),
      note: 'Order cancelled/refunded, restoring inventory'
    });
    return true;
  } catch (err) {
    logger.error('Restore inventory failed', { error: err.message, orderId: targetOrder._id });
    return false;
  }
}

async function resolveShippingCost({ computedShipping, deliveryPostcode, cod = false, items = [] }) {
  if (!config.shiprocket.liveRates || !deliveryPostcode || !shiprocketService.isConfigured()) {
    return computedShipping;
  }
  try {
    const live = await shiprocketService.estimateShipping({ deliveryPostcode, cod, items });
    if (live != null && live >= 0) {
      logger.info('Live Shiprocket shipping applied', { deliveryPostcode, amount: live, fallback: computedShipping });
      return live;
    }
  } catch (err) {
    logger.warn('Live Shiprocket shipping unavailable, using product shipping charges', { error: err.message, deliveryPostcode });
  }
  return computedShipping;
}

async function createOrderFromData({
  userId = null,
  items = [],
  paymentMethod = 'cod',
  shipping = 0,
  tax = 0,
  discount = 0,
  currency = 'INR',
  deliveryInfo = {},
  amount,
  notes = '',
  paymentStatus
}) {
  const lineItems = await buildOrderLineItems(items, deliveryInfo);
  if (!lineItems.length) {
    throw new Error('No valid order items found');
  }

  const computedShipping = lineItems.reduce((sum, item) => sum + Number(item.shippingCharge || 0) * item.quantity, 0);
  const shippingCost = await resolveShippingCost({
    computedShipping,
    deliveryPostcode: deliveryInfo?.postalCode || deliveryInfo?.postal,
    cod: paymentMethod === 'cod',
    items: lineItems
  });
  const orderTotals = calculateOrderTotals({
    items: lineItems,
    shipping: shippingCost,
    discount,
    billingState: deliveryInfo?.state,
    sellerState: GST_STATE
  });
  const subtotal = orderTotals.subtotal;
  const discountValue = orderTotals.discount;
  const taxAmount = orderTotals.taxTotal;
  const total = orderTotals.total;
  const status = paymentMethod === 'cod' ? 'pending' : 'confirmed';
  const finalPaymentStatus = paymentStatus || (paymentMethod === 'cod' ? 'pending' : 'paid');

  const normalizedAddress = {
    name: deliveryInfo.name || deliveryInfo.fullName || '',
    phone: deliveryInfo.phone,
    street: deliveryInfo.address,
    city: deliveryInfo.city,
    state: deliveryInfo.state,
    zipCode: deliveryInfo.postalCode || deliveryInfo.postal,
    country: deliveryInfo.country,
    email: deliveryInfo.email
  };

  const orderPayload = {
    orderNumber: createOrderNumber(),
    userId: userId || null,
    status,
    items: orderTotals.items,
    subtotal,
    cgstTotal: orderTotals.cgstTotal,
    sgstTotal: orderTotals.sgstTotal,
    igstTotal: orderTotals.igstTotal,
    tax: taxAmount,
    gstTotal: orderTotals.gstTotal,
    shipping: shippingCost,
    discount: discountValue,
    total,
    currency,
    shippingAddress: normalizedAddress,
    billingAddress: normalizedAddress,
    paymentMethod: paymentMethod || 'cod',
    paymentStatus: finalPaymentStatus,
    shipment: {
      status: 'pending',
      carrier: '',
      trackingNumber: '',
      estimatedDelivery: null,
      events: [{ status: 'created', message: 'Order received and pending shipment.' }]
    },
    notes: notes || ''
  };

  let order;
  try {
    await adjustInventory(lineItems, {
      operation: 'decrement',
      reference: orderPayload.orderNumber,
      note: 'Order created, reserving inventory'
    });

    order = await Order.create(orderPayload);

    const shipment = await Shipment.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: userId || null,
      status: 'pending',
      events: [{ status: 'created', message: 'Order received and pending shipment.' }]
    });

    order.shipmentId = shipment._id;
    await order.save();

    if (userId) {
      const notification = await Notification.create({
        userId,
        orderId: order._id,
        type: 'order',
        channel: 'app',
        title: 'Order created',
        message: `Your order ${order.orderNumber} has been received.`,
        data: { orderId: order._id }
      }).catch(() => null);
      await Cart.findOneAndDelete({ userId });

      if (notification && sseManager) {
        sseManager.sendToUser(userId, {
          type: 'notification',
          notification: {
            _id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            orderId: notification.orderId,
            isRead: false,
            createdAt: notification.createdAt,
          }
        }, 'notification');
      }
    }

    return order;
  } catch (err) {
    logger.error('Create order failed', { error: err.message, paymentMethod, userId });
    if (order && order._id) {
      await Order.findByIdAndDelete(order._id).catch(() => null);
    }
    try {
      await adjustInventory(lineItems, {
        operation: 'increment',
        reference: orderPayload.orderNumber,
        note: 'Order failed, restoring inventory'
      });
    } catch (restoreErr) {
      logger.error('CRITICAL: Failed to restore inventory after order creation failure — manual intervention required', { error: restoreErr.message, orderNumber: orderPayload.orderNumber, items: lineItems.map(i => ({ productId: i.productId, quantity: i.quantity })) });
    }
    throw err;
  }
}

module.exports = {
  createOrderFromData,
  sendOrderEmails,
  restoreInventoryForOrder,
  adjustInventory
};
