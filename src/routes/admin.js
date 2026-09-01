const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signAdminToken, requireAdmin } = require('../auth');
const { toPublicProduct } = require('../pricing');

const router = express.Router();

// Rudimentary rate-limit for login attempts (per-process, resets on restart).
const loginAttempts = new Map(); // ip -> { count, resetAt }
function tooManyAttempts(ip){
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

router.post('/admin/login', (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ success:false, message:'Terlalu banyak percobaan login. Coba lagi nanti.' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success:false, message:'Username & password wajib diisi.' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success:false, message:'Username atau password salah.' });
  }
  const token = signAdminToken(admin);
  res.json({ success:true, token });
});

router.get('/admin/products', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY type, sort_order').all();
  res.json({ success:true, data: rows.map(toPublicProduct) });
});

router.post('/admin/discount', requireAdmin, (req, res) => {
  const { productId, pct, label } = req.body || {};
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ success:false, message:'Produk tidak ditemukan.' });

  const pctNum = parseInt(pct, 10);
  if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
    return res.status(400).json({ success:false, message:'Persen diskon harus antara 0-100.' });
  }

  if (pctNum === 0) {
    // 0% is the same as "no discount" — clear it instead of storing a dead row.
    db.prepare('UPDATE products SET discount_pct = NULL, discount_label = NULL WHERE id = ?').run(productId);
  } else {
    const finalLabel = (label && String(label).trim()) || `-${pctNum}%`;
    db.prepare('UPDATE products SET discount_pct = ?, discount_label = ? WHERE id = ?')
      .run(pctNum, finalLabel, productId);
  }

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.json({ success:true, data: toPublicProduct(updated) });
});

router.delete('/admin/discount/:productId', requireAdmin, (req, res) => {
  const { productId } = req.params;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ success:false, message:'Produk tidak ditemukan.' });

  db.prepare('UPDATE products SET discount_pct = NULL, discount_label = NULL WHERE id = ?').run(productId);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.json({ success:true, data: toPublicProduct(updated) });
});

router.get('/admin/orders', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all();
  const data = rows.map(o => ({ ...o, items: JSON.parse(o.items_json) }));
  res.json({ success:true, data });
});

router.post('/admin/orders/:merchantRef/fulfill', requireAdmin, (req, res) => {
  const { merchantRef } = req.params;
  const order = db.prepare('SELECT * FROM orders WHERE merchant_ref = ?').get(merchantRef);
  if (!order) return res.status(404).json({ success:false, message:'Order tidak ditemukan.' });
  if (order.status !== 'PAID') {
    return res.status(400).json({ success:false, message:'Order belum berstatus PAID.' });
  }
  db.prepare('UPDATE orders SET fulfilled = 1 WHERE merchant_ref = ?').run(merchantRef);
  res.json({ success:true });
});

router.get('/admin/reports', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 200').all();
  res.json({ success:true, data: rows });
});

router.post('/admin/reports/:id/read', requireAdmin, (req, res) => {
  const { id } = req.params;
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) return res.status(404).json({ success:false, message:'Laporan tidak ditemukan.' });
  db.prepare('UPDATE reports SET read_flag = 1 WHERE id = ?').run(id);
  res.json({ success:true });
});

router.delete('/admin/reports/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) return res.status(404).json({ success:false, message:'Laporan tidak ditemukan.' });
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  res.json({ success:true });
});

module.exports = router;
