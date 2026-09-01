const express = require('express');
const db = require('../db');
const { toPublicProduct } = require('../pricing');

const router = express.Router();

router.get('/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY type, sort_order').all();
  res.json({ success: true, data: rows.map(toPublicProduct) });
});

module.exports = router;
