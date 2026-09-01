const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum diset di .env — wajib diisi string acak yang panjang & rahasia.');
}

function signAdminToken(admin){
  return jwt.sign({ sub: admin.id, username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
}

function requireAdmin(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies && req.cookies.admin_token);
  if (!token) return res.status(401).json({ success:false, message:'Butuh login admin.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('not admin');
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ success:false, message:'Sesi admin tidak valid atau kedaluwarsa.' });
  }
}

module.exports = { signAdminToken, requireAdmin };
