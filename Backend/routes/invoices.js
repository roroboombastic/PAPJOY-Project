const express = require('express');
const { auth, optionalAuth, verifyAdmin } = require('../middlewares/auth');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

<<<<<<< HEAD
// List user invoices (must be before /:orderId to avoid route conflict)
=======
// List user invoices (must be before :orderId param route)
>>>>>>> 5b221d0 (Add header, footer, admin styles, and footwear products)
router.get('/', auth, invoiceController.listUserInvoices);

// Admin invoice management
router.get('/admin', auth, verifyAdmin, invoiceController.listAllInvoices);

// Get invoice preview
router.get('/:orderId/preview', optionalAuth, invoiceController.getInvoicePreview);

// Download invoice as PDF
router.get('/:orderId/download', optionalAuth, invoiceController.downloadInvoicePDF);

<<<<<<< HEAD
=======
// Get invoice details (must be last among /:orderId routes)
router.get('/:orderId', optionalAuth, invoiceController.getInvoice);

>>>>>>> 5b221d0 (Add header, footer, admin styles, and footwear products)
module.exports = router;
