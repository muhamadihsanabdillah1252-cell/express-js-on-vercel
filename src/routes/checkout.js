const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const tripay = require('../tripay');
const { discountedPrice } = require('../pricing');

const router = express.Router();

const COIN_RATE = 10;
const CUSTOM_COIN_MIN = 100;

function genOrderCode(){
  return 'VLY-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Recompute every cart line from the DB — the client only sends
 * { id, mode, qty }. Prices are NEVER trusted from the client.
 */
function priceCartServerSide(items){
  const priced = [];
  let subtotal = 0;

  for (const line of items || []) {
    if (line.id === 'custom-coin') {
      const qty = Math.max(CUSTOM_COIN_MIN, parseInt(line.qty, 10) || 0);
      const price = qty * COIN_RATE;
      priced.push({ sku:'custom-coin', name:`${qty.toLocaleString('id-ID')} COIN (Custom)`, price, quantity:1, subtotal:price });
      subtotal += price;
      continue;
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.id);
    if (!product) continue;

    const qty = Math.max(1, parseInt(line.qty, 10) || 1);

    if (product.type === 'rank') {
      const isMonthly = line.mode === 'monthly';
      const basePrice = isMonthly ? product.price_monthly : product.price;
      const price = discountedPrice(basePrice, product.discount_pct);
      const name = product.name + (isMonthly ? ' (Bulanan)' : ' (Permanen)');
      priced.push({ sku: product.id + (isMonthly ? '-monthly' : ''), name, price, quantity: 1, subtotal: price });
      subtotal += price;
    } else {
      const price = discountedPrice(product.price, product.discount_pct);
      priced.push({ sku: product.id, name: product.name, price, quantity: qty, subtotal: price * qty });
      subtotal += price * qty;
    }
  }

  return { priced, subtotal };
}

router.post('/checkout', async (req, res) => {
  try {
    const { items, username, contact, method } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success:false, message:'Keranjang kosong.' });
    }
    if (!username || !contact) {
      return res.status(400).json({ success:false, message:'Username Minecraft & kontak wajib diisi.' });
    }

    const { priced, subtotal } = priceCartServerSide(items);
    if (priced.length === 0 || subtotal <= 0) {
      return res.status(400).json({ success:false, message:'Item di keranjang tidak valid.' });
    }

    const merchantRef = genOrderCode();
    const createdAt = Math.floor(Date.now() / 1000);

    // Fallback: gateway belum dikonfigurasi -> simpan order manual (mirip alur lama, tanpa pembayaran otomatis).
    if (!tripay.isConfigured()) {
      db.prepare(`
        INSERT INTO orders (merchant_ref, mc_username, contact, items_json, subtotal, payment_method, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'MANUAL', 'UNPAID', ?)
      `).run(merchantRef, username, contact, JSON.stringify(priced), subtotal, createdAt);

      return res.json({
        success: true,
        mode: 'manual',
        merchantRef,
        subtotal,
        message: 'Payment gateway belum dikonfigurasi admin. Simpan kode pesanan ini dan kirim ke admin untuk instruksi pembayaran manual.',
      });
    }

    if (!method) {
      return res.status(400).json({ success:false, message:'Pilih metode pembayaran.' });
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const result = await tripay.createTransaction({
      method,
      merchantRef,
      amount: subtotal,
      customerName: username,
      customerPhone: contact,
      items: priced,
      returnUrl: `${origin}/order.html?ref=${merchantRef}`,
      callbackUrl: `${origin}/api/payment/callback`,
    });

    if (!result.success) {
      return res.status(502).json({ success:false, message: result.message || 'Gagal membuat transaksi pembayaran.' });
    }

    db.prepare(`
      INSERT INTO orders (merchant_ref, mc_username, contact, items_json, subtotal, payment_method, tripay_reference, checkout_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', ?)
    `).run(merchantRef, username, contact, JSON.stringify(priced), subtotal, method, result.data.reference, result.data.checkout_url, createdAt);

    res.json({
      success: true,
      mode: 'gateway',
      merchantRef,
      subtotal,
      checkoutUrl: result.data.checkout_url,
      payCode: result.data.pay_code,
      qrUrl: result.data.qr_url,
    });
  } catch (err) {
    console.error('checkout error:', err);
    res.status(500).json({ success:false, message:'Terjadi kesalahan server saat checkout.' });
  }
});

router.get('/orders/:merchantRef', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE merchant_ref = ?').get(req.params.merchantRef);
  if (!order) return res.status(404).json({ success:false, message:'Order tidak ditemukan.' });
  res.json({
    success: true,
    data: {
      merchantRef: order.merchant_ref,
      status: order.status,
      subtotal: order.subtotal,
      items: JSON.parse(order.items_json),
      checkoutUrl: order.checkout_url,
      fulfilled: Boolean(order.fulfilled),
    },
  });
});

router.get('/payment-channels', async (req, res) => {
  if (!tripay.isConfigured()) {
    return res.json({ success:true, data: [], configured:false });
  }
  try {
    const result = await tripay.getPaymentChannels();
    if (!result.success) return res.status(502).json(result);
    res.json({ success:true, data: (result.data || []).filter(c => c.active), configured:true });
  } catch (err) {
    console.error('payment-channels error:', err);
    res.status(502).json({ success:false, message:'Gagal mengambil daftar metode pembayaran.' });
  }
});

module.exports = router;
