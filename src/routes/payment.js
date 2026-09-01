const express = require('express');
const db = require('../db');
const tripay = require('../tripay');

const router = express.Router();

// IMPORTANT: signature is computed over the *raw* request body bytes,
// so this route must NOT go through the global express.json() parser.
router.post('/payment/callback', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-callback-signature'];
  const event = req.headers['x-callback-event'];
  const rawBody = req.body; // Buffer, thanks to express.raw()

  if (!tripay.verifyCallbackSignature(rawBody.toString('utf8'), signature)) {
    return res.status(400).json({ success:false, message:'Invalid signature' });
  }
  if (event !== 'payment_status') {
    return res.json({ success:false, message:`Unrecognized event: ${event}` });
  }

  let data;
  try {
    data = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ success:false, message:'Invalid JSON' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE merchant_ref = ?').get(data.merchant_ref);
  if (!order) {
    return res.status(404).json({ success:false, message:`Order not found: ${data.merchant_ref}` });
  }

  const status = String(data.status || '').toUpperCase();
  if (!['PAID', 'FAILED', 'EXPIRED', 'REFUND'].includes(status)) {
    return res.json({ success:false, message:'Unrecognized payment status' });
  }

  const paidAt = data.paid_at || null;
  db.prepare('UPDATE orders SET status = ?, paid_at = ? WHERE merchant_ref = ?')
    .run(status, status === 'PAID' ? (paidAt || Math.floor(Date.now() / 1000)) : order.paid_at, data.merchant_ref);

  res.json({ success:true });
});

module.exports = router;
