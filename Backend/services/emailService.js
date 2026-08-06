const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM_NAME,
  SMTP_FROM_ADDRESS,
  FRONTEND_URL
} = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP not configured — emails will not be sent');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: SMTP_PORT !== 465,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });

  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    logger.info(`[EMAIL SKIPPED] To: ${to} | Subject: ${subject}`);
    return { success: false, skipped: true };
  }

  try {
    const info = await t.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_ADDRESS}>`,
      to,
      subject,
      html,
      text: text || htmlToText(html)
    });
    logger.info(`Email sent to ${to}`, { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}`, { error: err.message, code: err.code, command: err.command });
    return { success: false, error: err.message, code: err.code };
  }
}

function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8377;/g, 'Rs ')
    .replace(/₹/g, 'Rs ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanizeStatus(status) {
  if (!status) return 'Updated';
  return String(status)
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getTrackingLink(order) {
  const site = FRONTEND_URL || '';
  const orderRef = order.orderNumber || order._id || '';
  return site && orderRef ? `${site.replace(/\/$/, '')}/tracking.html?order=${encodeURIComponent(orderRef)}` : '';
}

function getShipmentInfo(order) {
  const s = order.shipment || {};
  return {
    trackingNumber: s.trackingNumber || order.trackingNumber || '',
    carrier: s.carrier || order.carrier || '',
    trackingUrl: s.trackingUrl || order.trackingUrl || '',
    status: s.status || order.status || ''
  };
}

function passwordResetTemplate(name, resetUrl) {
  return {
    subject: 'Reset your PAP-JOY password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#2d5a27">Password Reset</h2>
        <p>Hi ${name || 'there'},</p>
        <p>We received a request to reset your PAP-JOY password. Click the button below to set a new one. This link expires in 1 hour.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Reset Password</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break:break-all;font-size:12px;color:#555">${resetUrl}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
      </div>`
  };
}

function orderConfirmationTemplate(order) {
  const inr = (n) => '₹' + (Number(n) || 0).toFixed(2);
  const itemsHtml = (order.items || []).map(item =>
    `<tr><td style="padding:6px 0">${item.name} × ${item.quantity}</td><td style="padding:6px 0;text-align:right">${inr(item.unitPrice * item.quantity)}</td></tr>`
  ).join('');
  const breakdownRows = [
    `<tr><td style="padding:4px 0;color:#666">Subtotal</td><td style="padding:4px 0;text-align:right;color:#666">${inr(order.subtotal)}</td></tr>`,
    `<tr><td style="padding:4px 0;color:#666">Shipping</td><td style="padding:4px 0;text-align:right;color:#666">${order.shipping ? inr(order.shipping) : 'FREE'}</td></tr>`
  ];
  if (order.discount) {
    breakdownRows.push(`<tr><td style="padding:4px 0;color:#666">Discount</td><td style="padding:4px 0;text-align:right;color:#666">-${inr(order.discount)}</td></tr>`);
  }
  breakdownRows.push(`<tr><td style="padding:6px 0;font-weight:bold;border-top:1px solid #e0e0e0">Total</td><td style="padding:6px 0;text-align:right;font-weight:bold;border-top:1px solid #e0e0e0">${inr(order.total || order.amount)}</td></tr>`);
  const trackLink = getTrackingLink(order);

  return {
    subject: `Order Confirmed - #${order.orderNumber || order._id}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#2d5a27">Order Confirmed</h2>
        <p>Hi ${order.deliveryInfo?.name || order.shippingAddress?.name || 'there'},</p>
        <p>Your order <strong>#${order.orderNumber || order._id}</strong> has been placed successfully.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml}</table>
        <table style="width:100%;border-collapse:collapse;margin:8px 0">${breakdownRows.join('')}</table>
        <p style="font-size:12px;color:#666">All taxes are included in the prices above.</p>
        <p>We'll email you at each step as your order is processed and shipped.</p>
        ${trackLink ? `<p style="text-align:center;margin:24px 0"><a href="${trackLink}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Track Your Order</a></p>` : ''}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
      </div>`
  };
}

function invoiceEmailTemplate(invoice, pdfUrl) {
  return {
    subject: `Invoice #${invoice.invoiceNumber} for your PAP-JOY order`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#2d5a27">Invoice #${invoice.invoiceNumber}</h2>
        <p>Hi ${invoice.customerName || 'there'},</p>
        <p>Your invoice for order <strong>#${invoice.orderNumber || invoice.orderId}</strong> is ready.</p>
        ${pdfUrl ? `<p style="text-align:center;margin:24px 0"><a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Download Invoice (PDF)</a></p>` : ''}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
      </div>`
  };
}

function orderUpdateTemplate(order) {
  const statusText = humanizeStatus(order.status);
  const ship = getShipmentInfo(order);
  const trackLink = getTrackingLink(order);
  const trackingRows = [];
  if (ship.trackingNumber) {
    trackingRows.push(`<tr><td style="padding:4px 0;color:#666">Tracking Number</td><td style="padding:4px 0;text-align:right;color:#666"><strong>${ship.trackingNumber}</strong></td></tr>`);
  }
  if (ship.carrier) {
    trackingRows.push(`<tr><td style="padding:4px 0;color:#666">Carrier</td><td style="padding:4px 0;text-align:right;color:#666">${ship.carrier}</td></tr>`);
  }

  return {
    subject: `Order Update - #${order.orderNumber || order._id} — ${statusText}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#2d5a27">Order Update</h2>
        <p>Hi ${order.deliveryInfo?.name || order.shippingAddress?.name || 'there'},</p>
        <p>Your order <strong>#${order.orderNumber || order._id}</strong> is now <strong>${statusText}</strong>.</p>
        ${trackingRows.length ? `<table style="width:100%;border-collapse:collapse;margin:12px 0">${trackingRows.join('')}</table>` : ''}
        ${ship.trackingUrl ? `<p style="font-size:12px;color:#555">Carrier tracking: <a href="${ship.trackingUrl}" style="color:#2d5a27">${ship.trackingUrl}</a></p>` : ''}
        ${trackLink ? `<p style="text-align:center;margin:24px 0"><a href="${trackLink}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Track Your Order</a></p>` : ''}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
        <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
      </div>`
  };
}

module.exports = {
  sendMail,
  passwordResetTemplate,
  orderConfirmationTemplate,
  invoiceEmailTemplate,
  orderUpdateTemplate
};
