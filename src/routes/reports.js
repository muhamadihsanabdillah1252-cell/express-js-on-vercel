const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// Simple per-IP rate limit so this can't be spammed (resets on server restart).
const submitAttempts = new Map(); // ip -> { count, resetAt }
function tooManyReports(ip){
  const now = Date.now();
  const entry = submitAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    submitAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 5;
}

function genReportId(){
  return 'RPT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.post('/reports', (req, res) => {
  if (tooManyReports(req.ip)) {
    return res.status(429).json({ success:false, message:'Terlalu banyak laporan dikirim. Coba lagi nanti.' });
  }

  const { type, name, contact, description } = req.body || {};
  if (!['bug', 'saran'].includes(type)) {
    return res.status(400).json({ success:false, message:'Tipe laporan tidak valid.' });
  }
  const nameTrim = String(name || '').trim();
  const descTrim = String(description || '').trim();
  if (!nameTrim || !descTrim) {
    return res.status(400).json({ success:false, message:'Nama dan deskripsi wajib diisi.' });
  }
  if (descTrim.length > 2000) {
    return res.status(400).json({ success:false, message:'Deskripsi terlalu panjang (maks 2000 karakter).' });
  }

  const id = genReportId();
  db.prepare(`
    INSERT INTO reports (id, type, name, contact, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, type, nameTrim, String(contact || '').trim() || null, descTrim, Math.floor(Date.now() / 1000));

  res.json({ success:true, reportId: id });
});

module.exports = router;
