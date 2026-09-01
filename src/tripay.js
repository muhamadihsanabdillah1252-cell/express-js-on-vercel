const axios = require('axios');
const crypto = require('crypto');

const SANDBOX = String(process.env.TRIPAY_SANDBOX || 'true') === 'true';
const BASE_URL = SANDBOX
  ? 'https://tripay.co.id/api-sandbox'
  : 'https://tripay.co.id/api';

const API_KEY = process.env.TRIPAY_API_KEY || '';
const PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY || '';
const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || '';

function isConfigured(){
  return Boolean(API_KEY && PRIVATE_KEY && MERCHANT_CODE);
}

function client(){
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${API_KEY}` },
    validateStatus: () => true,
  });
}

/** GET /merchant/payment-channel — active channels for this merchant */
async function getPaymentChannels(){
  const res = await client().get('/merchant/payment-channel');
  return res.data;
}

/**
 * POST /transaction/create — closed payment.
 * items: [{ name, price, quantity, sku? }]
 */
async function createTransaction({ method, merchantRef, amount, customerName, customerEmail, customerPhone, items, returnUrl, callbackUrl }){
  const signature = crypto.createHmac('sha256', PRIVATE_KEY)
    .update(MERCHANT_CODE + merchantRef + amount)
    .digest('hex');

  const payload = {
    method,
    merchant_ref: merchantRef,
    amount,
    customer_name: customerName,
    customer_email: customerEmail || 'buyer@example.com',
    customer_phone: customerPhone || undefined,
    order_items: items,
    return_url: returnUrl,
    callback_url: callbackUrl,
    expired_time: Math.floor(Date.now() / 1000) + 60 * 60, // 1 jam
    signature,
  };

  const res = await client().post('/transaction/create', payload);
  return res.data;
}

/** GET /transaction/detail?reference=... */
async function getTransactionDetail(reference){
  const res = await client().get('/transaction/detail', { params: { reference } });
  return res.data;
}

/** Verify X-Callback-Signature against the raw JSON body Tripay sent us. */
function verifyCallbackSignature(rawBody, signatureHeader){
  const expected = crypto.createHmac('sha256', PRIVATE_KEY).update(rawBody).digest('hex');
  return expected === signatureHeader;
}

module.exports = {
  isConfigured,
  getPaymentChannels,
  createTransaction,
  getTransactionDetail,
  verifyCallbackSignature,
  SANDBOX,
};
