require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

require('./db'); // ensures DB + seed run before anything else

const paymentRoutes = require('./routes/payment'); // must be mounted BEFORE express.json()
const productRoutes = require('./routes/products');
const adminRoutes = require('./routes/admin');
const checkoutRoutes = require('./routes/checkout');
const reportRoutes = require('./routes/reports');

const app = express();
app.set('trust proxy', 1);

app.use('/api', paymentRoutes);       // uses its own raw body parser
app.use(express.json());
app.use(cookieParser());

app.use('/api', productRoutes);
app.use('/api', adminRoutes);
app.use('/api', checkoutRoutes);
app.use('/api', reportRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Valley Store server listening on http://localhost:${PORT}`);
});
