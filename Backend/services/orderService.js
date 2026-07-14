const { Order, Product, Notification, Cart, Shipment } = require('../models');
const logger = require('../utils/logger');
const { calculateOrderTotals, GST_STATE } = require('../utils/gst');

function createOrderNumber() {
  return `PJ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

async function buildOrderLineItems(items = [], deliveryInfo = {}) {
  const lineItems = [];
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const productId = item.productId || item.id || null;
    const product = productId ? await Product.findById(productId) : null;
    const price = Number(item.price || product?.price || 0);
    if (price < 0) continue;
    const itemTotal = quantity * price;

    if (!productId) {
      throw new Error('Order item must include a valid product id');
    }

    lineItems.push({
      productId: product ? product._id : productId,
      name: item.name || product?.name || 'Item',
      variant: item.variant || 'Standard',
      quantity,
      price,
      unitPrice: price,
      total: itemTotal,
      gstRate: Number(product?.gstPercentage || item.gstRate || 18),
      cgst: 0,
      sgst: 0,
      igst: 0
    });
  }
  return lineItems;
}

async function adjustInventory(items = [], { operation = 'decrement', reference = '', note = '' } = {}) {
  const direction = operation === 'increment' ? 1 : -1;
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const productId = item.productId || item.id;
    if (!productId) continue;

    const product = await Product.findById(productId);
    if (!product || !product.inventory?.trackInventory) continue;

    const variantKey = String(item.variant || '').trim().toLowerCase();
    const variant = Array.isArray(product.variants)
      ? product.variants.find((v) => {
          const name = String(v.name || '').toLowerCase();
          const value = String(v.value || '').toLowerCase();
          const sku = String(v.sku || '').toLowerCase();
          return variantKey && (variantKey === name || variantKey === value || variantKey === sku);
        })
      : null;

    if (variant && typeof variant.inventory === 'number') {
      const nextQuantity = variant.inventory + direction * quantity;
      if (operation === 'decrement' && nextQuantity < 0) {
        throw new Error(`Insufficient stock for ${product.name} (${variant.name || variant.value})`);
      }
      variant.inventory = Math.max(0, nextQuantity);
    } else {
      const nextQuantity = (product.inventory.quantity || 0) + direction * quantity;
      if (operation === 'decrement' && nextQuantity < 0) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      product.inventory.quantity = Math.max(0, nextQuantity);
    }

    product.stockMovements = product.stockMovements || [];
    product.stockMovements.push({
      quantity: direction * quantity,
      type: operation === 'increment' ? 'inbound' : 'outbound',
      reference,
      note: note || `Inventory ${operation} for order ${reference}`
    });

    await product.save();
  }
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

async function createOrderFromData({
  userId = null,
  items = [],
  paymentMethod = 'web',
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

  const orderTotals = calculateOrderTotals({
    items: lineItems,
    shipping,
    discount,
    billingState: deliveryInfo?.state,
    sellerState: GST_STATE
  });
  const subtotal = orderTotals.subtotal;
  const shippingCost = orderTotals.shipping;
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
    paymentMethod: paymentMethod || 'web',
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
      await Notification.create({
        userId,
        orderId: order._id,
        type: 'order',
        channel: 'app',
        title: 'Order created',
        message: `Your order ${order.orderNumber} has been received.`,
        data: { orderId: order._id }
      });
      await Cart.findOneAndDelete({ userId });
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
      logger.error('Failed to restore inventory after order creation failure', { error: restoreErr.message, orderNumber: orderPayload.orderNumber });
    }
    throw err;
  }
}

module.exports = {
  createOrderFromData,
  restoreInventoryForOrder,
  adjustInventory
};
