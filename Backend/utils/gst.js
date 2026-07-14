const { GST_PERCENT, GST_STATE, BUSINESS_GSTIN, BUSINESS_NAME } = require('../config');

const STATE_IGST_EXEMPT = ['ut', 'ld'];
const GST_STATE_CODES = {
  'andhra pradesh': 37,
  arunachal: 12,
  assam: 18,
  bihar: 10,
  chhattisgarh: 22,
  goa: 30,
  gujarat: 24,
  haryana: 06,
  himachal: 02,
  jharkhand: 20,
  karnataka: 29,
  kerala: 32,
  madhya: 23,
  maharashtra: 27,
  manipur: 14,
  meghalaya: 17,
  mizoram: 15,
  nagaland: 13,
  odisha: 21,
  punjab: 03,
  rajasthan: 08,
  sikkim: 11,
  tamil: 33,
  telangana: 36,
  tripura: 16,
  uttar: 09,
  'uttar pradesh': 09,
  uttarakhand: 05,
  west: 19,
  'west bengal': 19,
  delhi: 07,
  jammu: 01,
  kashmir: 01,
  pondicherry: 34,
  chandigarh: 04,
  daman: 26,
  diu: 26,
  dadra: 26,
  lakshadweep: 31,
  'daman and diu': 26,
  'daman and diu': 26,
  'dadra and nagar haveli': 26
};

function roundMoney(amount) {
  return Math.round(Number(amount || 0));
}

function normalizeState(value) {
  return String(value || '').trim().toLowerCase();
}

function calculateTax({ amount = 0, billingState = '', sellerState = '', gstPercent = GST_PERCENT }) {
  const normalizedBilling = normalizeState(billingState);
  const normalizedSeller = normalizeState(sellerState || GST_STATE);
  const interstate = normalizedBilling && normalizedSeller ? normalizedBilling !== normalizedSeller : false;
  const totalTaxRate = Number(gstPercent || GST_PERCENT) / 100;
  const taxAmount = roundMoney(Number(amount || 0) * totalTaxRate);
  const igstAmount = interstate ? taxAmount : 0;
  const half = interstate ? 0 : Math.round(taxAmount / 2);
  const cgst = interstate ? 0 : half;
  const sgst = interstate ? 0 : taxAmount - half;
  return {
    amount: taxAmount,
    cgst,
    sgst,
    igst: igstAmount,
    total: roundMoney(Number(amount || 0) + taxAmount),
    gstRate: Number(gstPercent || GST_PERCENT)
  };
}

function calculateOrderTotals({
  items = [],
  shipping = 0,
  discount = 0,
  billingState = '',
  sellerState = GST_STATE,
  gstPercent = GST_PERCENT
} = {}) {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = roundMoney(item.unitPrice ?? item.price ?? 0);
    const lineTotal = roundMoney(unitPrice * quantity);
    const taxInfo = calculateTax({ amount: lineTotal, billingState, sellerState, gstPercent: item.gstRate ?? gstPercent });
    return {
      ...item,
      quantity,
      unitPrice,
      price: unitPrice,
      total: lineTotal,
      gstRate: Number(item.gstRate ?? gstPercent),
      cgst: taxInfo.cgst,
      sgst: taxInfo.sgst,
      igst: taxInfo.igst,
      gstTotal: taxInfo.amount
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const shippingTotal = roundMoney(shipping);
  const discountTotal = roundMoney(discount);
  const cgstTotal = normalizedItems.reduce((sum, item) => sum + item.cgst, 0);
  const sgstTotal = normalizedItems.reduce((sum, item) => sum + item.sgst, 0);
  const igstTotal = normalizedItems.reduce((sum, item) => sum + item.igst, 0);
  const gstTotal = cgstTotal + sgstTotal + igstTotal;
  const total = roundMoney(subtotal + shippingTotal + gstTotal - discountTotal);

  return {
    items: normalizedItems,
    subtotal,
    shipping: shippingTotal,
    discount: discountTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal: gstTotal,
    gstTotal,
    total,
    gstPercent: Number(gstPercent || GST_PERCENT)
  };
}

function validateGstin(value) {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toUpperCase().trim();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(normalized);
}

module.exports = {
  calculateTax,
  calculateOrderTotals,
  roundMoney,
  validateGstin,
  GST_STATE_CODES,
  GST_PERCENT,
  GST_STATE,
  BUSINESS_GSTIN,
  BUSINESS_NAME
};
