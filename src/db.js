const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,            -- 'rank' | 'coin'
  name TEXT NOT NULL,
  price INTEGER NOT NULL,        -- rank: harga permanen. coin: harga beli.
  price_monthly INTEGER,         -- rank only
  qty INTEGER,                   -- coin only: jumlah coin
  color TEXT,                    -- rank only
  perm_tag TEXT,
  month_tag TEXT,
  coin_tag TEXT,
  perks TEXT,                    -- JSON array of strings
  sort_order INTEGER NOT NULL DEFAULT 0,
  discount_pct INTEGER,          -- 1-95, NULL = no discount
  discount_label TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  merchant_ref TEXT PRIMARY KEY,   -- our own order code, e.g. VLY-XXXXX
  mc_username TEXT NOT NULL,
  contact TEXT NOT NULL,
  items_json TEXT NOT NULL,        -- snapshot of items + prices at checkout time
  subtotal INTEGER NOT NULL,       -- sum of item prices (post-discount), before gateway fee
  payment_method TEXT,             -- Tripay channel code, e.g. QRIS, BRIVA
  tripay_reference TEXT,
  checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'UNPAID',  -- UNPAID | PAID | FAILED | EXPIRED | REFUND
  fulfilled INTEGER NOT NULL DEFAULT 0,   -- admin marks 1 once item is delivered in-game
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,          -- e.g. RPT-XXXXXXXX
  type TEXT NOT NULL,           -- 'bug' | 'saran'
  name TEXT NOT NULL,
  contact TEXT,
  description TEXT NOT NULL,
  read_flag INTEGER NOT NULL DEFAULT 0,   -- admin marks 1 once reviewed
  created_at INTEGER NOT NULL
);
`);

function seedProducts(){
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;

  const RANKS = [
    { id:'r1', name:'COPPER', price:9999, priceMonthly:4999, color:'#b5764f', permTag:null, monthTag:null,
      perks:['+2 slot /home','Akses /fly','Akses /workbench','Akses /hat'] },
    { id:'r2', name:'IRON', price:14999, priceMonthly:8999, color:'#d8d6cf', permTag:null, monthTag:null,
      perks:['Semua benefit Copper','+3 slot /home','Akses /enderchest','Akses /anvil'] },
    { id:'r3', name:'GOLD', price:24999, priceMonthly:14999, color:'#e8c341', permTag:null, monthTag:'FAVORIT',
      perks:['Semua benefit Iron','+8 slot /home','Akses /ptime','Akses /smithingtable','Akses /tpahere'] },
    { id:'r4', name:'REDSTONE', price:34999, priceMonthly:20999, color:'#b5291f', permTag:'TERLARIS', monthTag:null,
      perks:['Semua benefit Gold','+12 slot /home','Akses /disposal','Akses /feed','Akses /grindstone','Akses /recipe'] },
    { id:'r5', name:'AMETHYST', price:49999, priceMonthly:30999, color:'#9a5fd4', permTag:'BEST VALUE', monthTag:null,
      perks:['Semua benefit Redstone','+16 slot /home','Akses /nick','Akses /pweather','Akses /repair','Akses /thunder'] },
    { id:'r6', name:'DIAMOND', price:79999, priceMonthly:49999, color:'#5fd6d0', permTag:'PALING DIMINATI', monthTag:null,
      perks:['Semua benefit Amethyst','+20 slot /home','Akses /condense','Akses /ice','Akses /nick color','Akses /silentquit'] },
    { id:'r7', name:'NETHERITE', price:119999, priceMonthly:74999, color:'#4a4038', permTag:'LEGENDARIS', monthTag:null,
      perks:['Semua benefit Diamond','+24 slot /home','Akses join full server','Keep EXP saat mati','Akses /burn, /heal, /near','Akses /repair all & /jailedplayers'] },
  ];

  const COIN_RATE = 10;
  const COINS = [
    { id:'c1', qty:300, tag:null },
    { id:'c2', qty:600, tag:null },
    { id:'c3', qty:900, tag:null },
    { id:'c4', qty:1200, tag:'TERLARIS' },
    { id:'c5', qty:1800, tag:null },
    { id:'c6', qty:2500, tag:null },
    { id:'c7', qty:3600, tag:'PALING HEMAT' },
  ];

  const insert = db.prepare(`
    INSERT INTO products (id, type, name, price, price_monthly, qty, color, perm_tag, month_tag, coin_tag, perks, sort_order)
    VALUES (@id, @type, @name, @price, @price_monthly, @qty, @color, @perm_tag, @month_tag, @coin_tag, @perks, @sort_order)
  `);

  const tx = db.transaction(() => {
    RANKS.forEach((r, i) => insert.run({
      id: r.id, type: 'rank', name: r.name, price: r.price, price_monthly: r.priceMonthly,
      qty: null, color: r.color, perm_tag: r.permTag, month_tag: r.monthTag, coin_tag: null,
      perks: JSON.stringify(r.perks), sort_order: i,
    }));
    COINS.forEach((c, i) => insert.run({
      id: c.id, type: 'coin', name: `${c.qty.toLocaleString('id-ID')} COIN`, price: c.qty * COIN_RATE,
      price_monthly: null, qty: c.qty, color: null, perm_tag: null, month_tag: null, coin_tag: c.tag,
      perks: JSON.stringify(['Masuk otomatis ke saldo /points', 'Bisa dipakai untuk sewa rank 4 hari']),
      sort_order: i,
    }));
  });
  tx();
}

function seedAdmin(){
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'valley123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`[seed] Admin account created -> username: "${username}" (password from ADMIN_PASSWORD env, or default "valley123"). Change this in .env!`);
}

seedProducts();
seedAdmin();

module.exports = db;
