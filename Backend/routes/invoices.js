const express = require('express');
const { auth, optionalAuth, verifyAdmin } = require('../middlewares/auth');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

// Admin invoice management
router.get('/admin', auth, verifyAdmin, invoiceController.listAllInvoices);

// Get invoice details
router.get('/:orderId', optionalAuth, invoiceController.getInvoice);

// Get invoice preview
router.get('/:orderId/preview', optionalAuth, invoiceController.getInvoicePreview);

// Download invoice as PDF
router.get('/:orderId/download', optionalAuth, invoiceController.downloadInvoicePDF);

// List user invoices
router.get('/', auth, invoiceController.listUserInvoices);

module.exports = router;
