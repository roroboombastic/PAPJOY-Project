const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { smtp } = require('../config');

  if (!smtp.host || !smtp.user || !smtp.pass) {
    logger.warn('SMTP not configured — emails will not be sent');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    requireTLS: !smtp.secure
  });

  transporter.verify().then(() => {
    logger.info('SMTP connection verified successfully');
  }).catch((err) => {
    logger.error('SMTP connection verification failed', { error: err.message });
    transporter = null;
  });

  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    logger.info(`[EMAIL SKIPPED] To: ${to} | Subject: ${subject}`);
    return { success: false, skipped: true };
  }

  const { smtp } = require('../config');

  try {
    const info = await t.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
      to,
      subject,
      html
    });
    logger.info(`Email sent to ${to}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

function passwordResetTemplate(name, resetUrl) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#2d5a27">Password Reset</h2>
      <p>Hi ${name || 'there'},</p>
      <p>We received a request to reset your PAP-JOY password. Click the button below to set a new one. This link expires in 1 hour.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Reset Password</a>
      </p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid#e0e0e0;margin:24px 0">
      <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
    </div>`;
}

function orderConfirmationTemplate(order) {
  const itemsHtml = (order.items || []).map(item =>
    `<tr><td style="padding:6px 0">${item.name} × ${item.quantity}</td><td style="padding:6px 0;text-align:right">₹${(item.unitPrice * item.quantity).toFixed(2)}</td></tr>`
  ).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#2d5a27">Order Confirmed</h2>
      <p>Hi ${order.deliveryInfo?.name || 'there'},</p>
      <p>Your order <strong>#${order.orderNumber || order._id}</strong> has been placed successfully.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml}</table>
      <p style="font-size:15px"><strong>Total: ₹${(order.total || order.amount || 0).toFixed(2)}</strong></p>
      <p>We'll notify you when it ships.</p>
      <hr style="border:none;border-top:1px solid#e0e0e0;margin:24px 0">
      <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
    </div>`;
}

function invoiceEmailTemplate(invoice, pdfUrl) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#2d5a27">Invoice #${invoice.invoiceNumber}</h2>
      <p>Hi ${invoice.customerName || 'there'},</p>
      <p>Your invoice for order <strong>#${invoice.orderNumber || invoice.orderId}</strong> is ready.</p>
      ${pdfUrl ? `<p style="text-align:center;margin:24px 0"><a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:6px;font-size:15px">Download Invoice (PDF)</a></p>` : ''}
      <hr style="border:none;border-top:1px solid#e0e0e0;margin:24px 0">
      <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
    </div>`;
}

function orderUpdateTemplate(order) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#2d5a27">Order Update</h2>
      <p>Hi ${order.deliveryInfo?.name || 'there'},</p>
      <p>Your order <strong>#${order.orderNumber || order._id}</strong> status has been updated to <strong>${order.status}</strong>.</p>
      ${order.trackingNumber ? `<p>Tracking: <strong>${order.trackingNumber}</strong></p>` : ''}
      <hr style="border:none;border-top:1px solid#e0e0e0;margin:24px 0">
      <p style="font-size:12px;color:#888">PAP-JOY · Premium footwear for every journey.</p>
    </div>`;
}

module.exports = {
  sendMail,
  passwordResetTemplate,
  orderConfirmationTemplate,
  invoiceEmailTemplate,
  orderUpdateTemplate
};
