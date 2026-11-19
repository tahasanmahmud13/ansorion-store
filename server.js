'use strict';
// ANSORION store: storefront, order API and admin panel.
// No npm packages needed: runs on Node.js 22.5+ with the built-in SQLite module.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDatabase } = require('./lib/db');
const { garmentSVG } = require('./lib/garment');

const os = require('node:os');
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
// Vercel's code folder is read-only, so data goes to its temporary folder there.
// Note: that folder is wiped whenever Vercel starts a fresh copy of the app.
const ON_VERCEL = !!process.env.VERCEL;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR)
  : ON_VERCEL ? path.join(os.tmpdir(), 'ansorion-data') : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(UPLOADS, { recursive: true });
const db = openDatabase(DATA);

/* ---------------- admin account ---------------- */
const ADMIN_FILE = path.join(DATA, 'admin.json');
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function writeAdmin(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ username, salt, hash: hashPassword(password, salt) }, null, 2));
}
if (!fs.existsSync(ADMIN_FILE)) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  writeAdmin('admin', pw);
  if (ON_VERCEL) {
    if (!process.env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set in Vercel. Add it under Settings > Environment Variables to use /admin.');
  } else {
    fs.writeFileSync(path.join(DATA, 'ADMIN-LOGIN.txt'),
      `ANSORION admin panel\nURL: /admin\nUsername: admin\nPassword: ${pw}\n\nChange this password from Admin > Settings, then delete this file.\n`);
    console.log('Admin account created. Login details saved to data/ADMIN-LOGIN.txt');
  }
}
function readAdmin() { return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); }
function checkPassword(username, password) {
  const a = readAdmin();
  if (typeof username !== 'string' || typeof password !== 'string' || username !== a.username) return false;
  const h = Buffer.from(hashPassword(password, a.salt), 'hex');
  return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
}

/* ---------------- helpers ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? (headers['Content-Type'] || 'text/plain; charset=utf-8') : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : NaN; };
function normalizePhone(p) {
  let s = str(p, 30).replace(/[\s-]/g, '');
  if (s.startsWith('+88')) s = s.slice(3); else if (s.startsWith('88') && s.length === 13) s = s.slice(2);
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}
const emailOk = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

function imageUrl(image) {
  if (!image) return '/assets/placeholder.svg';
  if (image.startsWith('gen:')) { const [, type, hex] = image.split(':'); return `/img/garment/${type}/${hex}.svg`; }
  return image;
}
function publicProduct(p) {
  return {
    id: p.id, slug: p.slug, name: p.name, category: p.category, color: p.color_name, description: p.description,
    price: p.price, sale_price: p.sale_price, stock: p.stock, in_stock: p.stock > 0,
    sizes: p.sizes.split(',').map((s) => s.trim()).filter(Boolean),
    image: imageUrl(p.image), featured: !!p.featured, is_new: !!p.is_new,
  };
}
const unitPrice = (p) => (p.sale_price && p.sale_price < p.price ? p.sale_price : p.price);

function newOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (;;) {
    const no = `ANS-${ymd}-${crypto.randomInt(1000, 9999)}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE order_no = ?').get(no)) return no;
  }
}

/* ---------------- sessions ---------------- */
const SESSION_DAYS = 7;
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isAdmin(req) {
  const t = parseCookies(req).ans_admin;
  if (!t) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(t);
  return !!row && row.expires_at > Date.now();
}
function cookieFlags(req) { return req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : ''; }

const loginFails = new Map();
function ipOf(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

// ---- public API
route('GET', /^\/api\/settings$/, () => {
  const s = getSettings();
  return {
    delivery_inside: int(s.delivery_inside), delivery_outside: int(s.delivery_outside),
    free_delivery_over: int(s.free_delivery_over), announcement: s.announcement, whatsapp: s.whatsapp,
    contact_phone: s.contact_phone, contact_email: s.contact_email, bkash_number: s.bkash_number,
    nagad_number: s.nagad_number, facebook_url: s.facebook_url,
  };
});

route('GET', /^\/api\/products$/, (req, m, url) => {
  const q = url.searchParams;
  const where = ['active = 1']; const args = [];
  if (q.get('category')) { where.push('category = ?'); args.push(q.get('category')); }
  if (q.get('featured') === '1') where.push('featured = 1');
  if (q.get('new') === '1') where.push('is_new = 1');
  if (q.get('q')) { where.push('(name LIKE ? OR category LIKE ? OR color_name LIKE ?)'); const like = `%${q.get('q')}%`; args.push(like, like, like); }
  if (q.get('ids')) {
    const ids = q.get('ids').split(',').map(Number).filter(Number.isInteger).slice(0, 100);
    if (!ids.length) return [];
    where.push(`id IN (${ids.map(() => '?').join(',')})`); args.push(...ids);
  }
  const sorts = { new: 'id DESC', price_asc: 'COALESCE(sale_price, price) ASC', price_desc: 'COALESCE(sale_price, price) DESC' };
  const order = sorts[q.get('sort')] || 'featured DESC, id ASC';
  const limit = Math.min(int(q.get('limit')) || 200, 200);
  return db.prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY (stock > 0) DESC, ${order} LIMIT ${limit}`)
    .all(...args).map(publicProduct);
});

route('GET', /^\/api\/categories$/, () =>
  db.prepare('SELECT category AS name, COUNT(*) AS count, MIN(image) AS image FROM products WHERE active = 1 GROUP BY category ORDER BY MIN(id)').all()
    .map((c) => ({ ...c, image: imageUrl(c.image) })));

route('GET', /^\/api\/products\/([a-z0-9-]+)$/, (req, m) => {
  const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(m[1]);
  if (!p) throw new HttpError(404, 'Product not found.');
  return publicProduct(p);
});

route('POST', /^\/api\/orders$/, async (req) => {
  const body = await readBody(req);
  const c = body.customer || {};
  const name = str(c.name, 80), address = str(c.address, 300), city = str(c.city, 60), email = str(c.email, 120);
  const phone = normalizePhone(c.phone);
  const zone = c.zone === 'outside' ? 'outside' : c.zone === 'inside' ? 'inside' : null;
  const errors = {};
  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!phone) errors.phone = 'Enter a valid Bangladeshi mobile number, like 01712345678.';
  if (address.length < 6) errors.address = 'Enter your full delivery address.';
  if (city.length < 2) errors.city = 'Enter your city or district.';
  if (!zone) errors.zone = 'Choose a delivery area.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address, or leave it empty.';
  const methods = { cod: 'Cash on delivery', bkash: 'bKash', nagad: 'Nagad' };
  const method = methods[body.payment?.method] ? body.payment.method : null;
  const ref = str(body.payment?.ref, 40);
  if (!method) errors.payment = 'Choose a payment method.';
  if (method && method !== 'cod' && ref.length < 6) errors.payment_ref = 'Enter the transaction ID from your payment.';
  if (!Array.isArray(body.items) || body.items.length === 0) errors.items = 'Your cart is empty.';
  if (Object.keys(errors).length) { const e = new HttpError(422, 'Please check the highlighted fields.'); e.errors = errors; throw e; }

  // Prices and stock always come from the database, never from the browser.
  const lines = []; const want = new Map();
  for (const it of body.items.slice(0, 50)) {
    const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(it.productId));
    const qty = int(it.qty);
    if (!p) throw new HttpError(409, 'An item in your cart is no longer available. Please refresh your cart.');
    if (!(qty >= 1 && qty <= 20)) throw new HttpError(422, 'Quantity must be between 1 and 20.');
    const sizes = p.sizes.split(',').map((s) => s.trim());
    const size = str(it.size, 10);
    if (!sizes.includes(size)) throw new HttpError(422, `Choose a valid size for ${p.name}.`);
    want.set(p.id, (want.get(p.id) || 0) + qty);
    if (want.get(p.id) > p.stock) throw new HttpError(409, `Only ${p.stock} left of ${p.name}${p.color_name ? ' (' + p.color_name + ')' : ''}.`);
    const u = unitPrice(p);
    lines.push({ p, size, qty, unit: u, total: u * qty });
  }
  const s = getSettings();
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const freeOver = int(s.free_delivery_over) || 0;
  const delivery = freeOver > 0 && subtotal >= freeOver ? 0 : int(zone === 'inside' ? s.delivery_inside : s.delivery_outside) || 0;
  const total = subtotal + delivery;
  const orderNo = newOrderNo();

  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare(`INSERT INTO orders (order_no, customer_name, phone, email, address, city, zone, note, payment_method, payment_ref, subtotal, delivery_charge, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(orderNo, name, phone, email, address, city, zone, str(c.note, 500), methods[method], method === 'cod' ? '' : ref, subtotal, delivery, total);
    const itemStmt = db.prepare('INSERT INTO order_items (order_id, product_id, name, size, qty, unit_price, line_total, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const l of lines) {
      const label = l.p.color_name ? `${l.p.name} - ${l.p.color_name}` : l.p.name;
      itemStmt.run(r.lastInsertRowid, l.p.id, label, l.size, l.qty, l.unit, l.total, imageUrl(l.p.image));
      if (stockStmt.run(l.qty, l.p.id, l.qty).changes !== 1) throw new HttpError(409, `${l.p.name} just sold out. Please update your cart.`);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { order_no: orderNo, subtotal, delivery_charge: delivery, total, payment_method: methods[method] };
});

route('GET', /^\/api\/orders\/track$/, (req, m, url) => {
  const no = str(url.searchParams.get('order_no'), 30).toUpperCase();
  const phone = normalizePhone(url.searchParams.get('phone'));
  const o = phone && db.prepare('SELECT * FROM orders WHERE order_no = ? AND phone = ?').get(no, phone);
  if (!o) throw new HttpError(404, 'We could not find an order with that number and phone. Check both and try again.');
  const items = db.prepare('SELECT name, size, qty, line_total, image FROM order_items WHERE order_id = ?').all(o.id);
  return { order_no: o.order_no, status: o.status, created_at: o.created_at, updated_at: o.updated_at, total: o.total,
    delivery_charge: o.delivery_charge, payment_method: o.payment_method, customer_name: o.customer_name, city: o.city, items };
});

route('POST', /^\/api\/wholesale$/, async (req) => {
  const b = await readBody(req);
  const full_name = str(b.full_name, 80), phone = normalizePhone(b.phone), email = str(b.email, 120);
  const errors = {};
  if (full_name.length < 2) errors.full_name = 'Enter your full name.';
  if (!phone) errors.phone = 'Enter a valid Bangladeshi mobile number.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address.';
  if (Object.keys(errors).length) { const e = new HttpError(422, 'Please check the highlighted fields.'); e.errors = errors; throw e; }
  db.prepare('INSERT INTO wholesale_requests (full_name, company, email, phone, products, quantity, message) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(full_name, str(b.company, 120), email, phone, str(b.products, 300), str(b.quantity, 60), str(b.message, 1500));
  return { ok: true };
});

route('POST', /^\/api\/messages$/, async (req) => {
  const b = await readBody(req);
  const name = str(b.name, 80), message = str(b.message, 2000), email = str(b.email, 120);
  const phone = b.phone ? normalizePhone(b.phone) : '';
  const errors = {};
  if (name.length < 2) errors.name = 'Enter your name.';
  if (b.phone && !phone) errors.phone = 'Enter a valid Bangladeshi mobile number.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address.';
  if (!phone && !email) errors.phone = 'Add a phone number or email so we can reply.';
  if (message.length < 5) errors.message = 'Write a short message.';
  if (Object.keys(errors).length) { const e = new HttpError(422, 'Please check the highlighted fields.'); e.errors = errors; throw e; }
  db.prepare('INSERT INTO messages (name, phone, email, topic, message) VALUES (?, ?, ?, ?, ?)').run(name, phone || '', email, str(b.topic, 40) || 'General', message);
  return { ok: true };
});

// ---- admin auth
route('POST', /^\/api\/admin\/login$/, async (req, m, url, res) => {
  const ip = ipOf(req); const f = loginFails.get(ip);
  if (f && f.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  const b = await readBody(req);
  if (!checkPassword(b.username, b.password)) {
    const n = (f?.count || 0) + 1;
    loginFails.set(ip, { count: n, until: n >= 8 ? Date.now() + 10 * 60 * 1000 : 0 });
    throw new HttpError(401, 'Wrong username or password.');
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, Date.now() + SESSION_DAYS * 864e5);
  res.setHeader('Set-Cookie', `ans_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${cookieFlags(req)}`);
  return { ok: true };
});
route('POST', /^\/api\/admin\/logout$/, (req, m, url, res) => {
  const t = parseCookies(req).ans_admin;
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', `ans_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieFlags(req)}`);
  return { ok: true };
});
route('GET', /^\/api\/admin\/me$/, (req) => ({ loggedIn: isAdmin(req), username: isAdmin(req) ? readAdmin().username : null }));

// ---- admin data (all require login)
const A = { admin: true };
route('GET', /^\/api\/admin\/stats$/, () => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  return {
    orders_total: one('SELECT COUNT(*) n FROM orders').n,
    orders_pending: one("SELECT COUNT(*) n FROM orders WHERE status = 'Pending'").n,
    orders_today: one("SELECT COUNT(*) n FROM orders WHERE date(created_at) = date('now')").n,
    revenue: one("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status != 'Cancelled'").n,
    revenue_delivered: one("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status = 'Delivered'").n,
    wholesale_new: one("SELECT COUNT(*) n FROM wholesale_requests WHERE status = 'New'").n,
    messages_unread: one('SELECT COUNT(*) n FROM messages WHERE is_read = 0').n,
    low_stock: db.prepare('SELECT id, name, color_name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock ASC LIMIT 8').all(),
    by_status: db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all(),
    recent: db.prepare('SELECT id, order_no, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 6').all(),
  };
}, A);

const STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
function orderQuery(url) {
  const where = []; const args = [];
  const st = url.searchParams.get('status');
  if (st && STATUSES.includes(st)) { where.push('o.status = ?'); args.push(st); }
  const q = str(url.searchParams.get('q'), 60);
  if (q) { where.push('(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ? OR o.city LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}
route('GET', /^\/api\/admin\/orders$/, (req, m, url) => {
  const { where, args } = orderQuery(url);
  return db.prepare(`SELECT o.*, (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS item_count,
    (SELECT GROUP_CONCAT(name || ' (' || size || ') x' || qty, ', ') FROM order_items WHERE order_id = o.id) AS summary
    FROM orders o ${where} ORDER BY o.id DESC LIMIT 500`).all(...args);
}, A);
route('GET', /^\/api\/admin\/orders\.csv$/, (req, m, url, res) => {
  const { where, args } = orderQuery(url);
  const rows = db.prepare(`SELECT o.*, (SELECT GROUP_CONCAT(name || ' (' || size || ') x' || qty, '; ') FROM order_items WHERE order_id = o.id) AS items
    FROM orders o ${where} ORDER BY o.id DESC`).all(...args);
  const cols = ['order_no', 'created_at', 'status', 'customer_name', 'phone', 'email', 'address', 'city', 'zone', 'items', 'subtotal', 'delivery_charge', 'total', 'payment_method', 'payment_ref', 'note'];
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
  send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ansorion-orders-${new Date().toISOString().slice(0, 10)}.csv"` });
  return undefined;
}, A);
route('GET', /^\/api\/admin\/orders\/(\d+)$/, (req, m) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(m[1]));
  if (!o) throw new HttpError(404, 'Order not found.');
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  return o;
}, A);
route('PATCH', /^\/api\/admin\/orders\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(m[1]));
  if (!o) throw new HttpError(404, 'Order not found.');
  const status = b.status !== undefined ? b.status : o.status;
  if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status.');
  const note = b.admin_note !== undefined ? str(b.admin_note, 1000) : o.admin_note;
  db.exec('BEGIN IMMEDIATE');
  try {
    // Cancelling puts the items back in stock; reopening a cancelled order takes them out again.
    if (status !== o.status && (status === 'Cancelled' || o.status === 'Cancelled')) {
      const sign = status === 'Cancelled' ? 1 : -1;
      for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(o.id)) {
        if (it.product_id) db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(sign * it.qty, it.product_id);
      }
    }
    db.prepare("UPDATE orders SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?").run(status, note, o.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true };
}, A);
route('DELETE', /^\/api\/admin\/orders\/(\d+)$/, (req, m) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(int(m[1]));
  return { ok: true };
}, A);

route('GET', /^\/api\/admin\/wholesale$/, () => db.prepare('SELECT * FROM wholesale_requests ORDER BY id DESC LIMIT 500').all(), A);
route('PATCH', /^\/api\/admin\/wholesale\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  if (!['New', 'Contacted', 'Deal closed', 'Not a fit'].includes(b.status)) throw new HttpError(422, 'Unknown status.');
  db.prepare('UPDATE wholesale_requests SET status = ? WHERE id = ?').run(b.status, int(m[1]));
  return { ok: true };
}, A);
route('GET', /^\/api\/admin\/messages$/, () => db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 500').all(), A);
route('PATCH', /^\/api\/admin\/messages\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(b.is_read ? 1 : 0, int(m[1]));
  return { ok: true };
}, A);

route('GET', /^\/api\/admin\/products$/, () =>
  db.prepare('SELECT * FROM products ORDER BY id DESC').all().map((p) => ({ ...p, image_url: imageUrl(p.image) })), A);
function productInput(b) {
  const name = str(b.name, 100), category = str(b.category, 40);
  const price = int(b.price), sale = b.sale_price === '' || b.sale_price == null ? null : int(b.sale_price);
  const stock = int(b.stock);
  const sizes = str(b.sizes, 120).split(',').map((s) => s.trim()).filter(Boolean).join(',');
  const errors = {};
  if (name.length < 2) errors.name = 'Enter a product name.';
  if (category.length < 2) errors.category = 'Enter a category.';
  if (!(price > 0)) errors.price = 'Enter a price in taka.';
  if (sale !== null && !(sale > 0 && sale < price)) errors.sale_price = 'Sale price must be lower than the regular price.';
  if (!(stock >= 0)) errors.stock = 'Enter stock (0 or more).';
  if (!sizes) errors.sizes = 'Enter at least one size.';
  const image = str(b.image, 300);
  if (image && !/^(gen:[a-z]+:[0-9a-f]{6}|\/uploads\/[A-Za-z0-9._-]+)$/.test(image)) errors.image = 'Upload an image.';
  if (Object.keys(errors).length) { const e = new HttpError(422, 'Please check the highlighted fields.'); e.errors = errors; throw e; }
  return { name, category, color_name: str(b.color_name, 40), description: str(b.description, 3000), price, sale_price: sale,
    stock, sizes, image, featured: b.featured ? 1 : 0, is_new: b.is_new ? 1 : 0, active: b.active === false ? 0 : 1 };
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'product'; }
route('POST', /^\/api\/admin\/products$/, async (req) => {
  const p = productInput(await readBody(req));
  let slug = slugify(`${p.name} ${p.color_name}`), n = 2;
  while (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug = `${slugify(`${p.name} ${p.color_name}`)}-${n++}`;
  const r = db.prepare(`INSERT INTO products (slug, name, category, color_name, description, price, sale_price, stock, sizes, image, featured, is_new, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slug, p.name, p.category, p.color_name, p.description, p.price, p.sale_price, p.stock, p.sizes, p.image, p.featured, p.is_new, p.active);
  return { id: Number(r.lastInsertRowid), slug };
}, A);
route('PUT', /^\/api\/admin\/products\/(\d+)$/, async (req, m) => {
  const p = productInput(await readBody(req));
  const r = db.prepare(`UPDATE products SET name=?, category=?, color_name=?, description=?, price=?, sale_price=?, stock=?, sizes=?, image=?, featured=?, is_new=?, active=? WHERE id=?`)
    .run(p.name, p.category, p.color_name, p.description, p.price, p.sale_price, p.stock, p.sizes, p.image, p.featured, p.is_new, p.active, int(m[1]));
  if (!r.changes) throw new HttpError(404, 'Product not found.');
  return { ok: true };
}, A);
route('DELETE', /^\/api\/admin\/products\/(\d+)$/, (req, m) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(int(m[1]));
  return { ok: true };
}, A);
route('POST', /^\/api\/admin\/upload$/, async (req) => {
  const b = await readBody(req, 8 * 1024 * 1024);
  const mm = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
  if (!mm) throw new HttpError(422, 'Upload a JPG, PNG or WebP image.');
  const buf = Buffer.from(mm[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'Image must be under 5 MB.');
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${mm[1] === 'jpeg' ? 'jpg' : mm[1]}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return { path: `/uploads/${name}` };
}, A);

const SETTING_KEYS = ['delivery_inside', 'delivery_outside', 'free_delivery_over', 'announcement', 'whatsapp', 'contact_phone', 'contact_email', 'bkash_number', 'nagad_number', 'facebook_url'];
route('GET', /^\/api\/admin\/settings$/, () => getSettings(), A);
route('PUT', /^\/api\/admin\/settings$/, async (req) => {
  const b = await readBody(req);
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of SETTING_KEYS) {
    if (b[k] === undefined) continue;
    let v = str(String(b[k]), 300);
    if (['delivery_inside', 'delivery_outside', 'free_delivery_over'].includes(k)) {
      const n = int(v); if (!(n >= 0)) throw new HttpError(422, 'Delivery charges must be 0 or more.'); v = String(n);
    }
    if (k === 'facebook_url' && v && !/^https:\/\//.test(v)) throw new HttpError(422, 'Facebook link must start with https://');
    stmt.run(k, v);
  }
  return { ok: true };
}, A);
route('POST', /^\/api\/admin\/password$/, async (req) => {
  const b = await readBody(req);
  const a = readAdmin();
  if (!checkPassword(a.username, b.current)) throw new HttpError(401, 'Current password is wrong.');
  if (typeof b.next !== 'string' || b.next.length < 8) throw new HttpError(422, 'New password must be at least 8 characters.');
  writeAdmin(a.username, b.next);
  db.prepare('DELETE FROM sessions').run();
  return { ok: true };
}, A);

/* ---------------- static files ---------------- */
function serveFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, notFoundPage(), { 'Content-Type': 'text/html; charset=utf-8' });
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
  });
}
function notFoundPage() {
  try { return fs.readFileSync(path.join(PUBLIC, '404.html')); } catch { return 'Not found'; }
}
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p.startsWith('/uploads/')) {
    const f = path.join(UPLOADS, path.basename(p));
    return serveFile(res, f, 'public, max-age=604800');
  }
  const g = /^\/img\/garment\/([a-z]+)\/([0-9a-f]{6})\.svg$/i.exec(p);
  if (g) {
    const svg = garmentSVG(g[1], g[2]);
    if (!svg) return send(res, 404, 'Not found');
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  }
  if (p === '/' ) p = '/index.html';
  else if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
  else if (!path.extname(p)) p = p.replace(/\/$/, '') + '.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  const isHtml = file.endsWith('.html');
  if (p.startsWith('/admin')) res.setHeader('X-Frame-Options', 'DENY');
  serveFile(res, file, isHtml ? 'no-cache' : 'public, max-age=3600');
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      if (r.admin && !isAdmin(req)) throw new HttpError(401, 'Please log in again.');
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON.');
      }
      const out = await r.handler(req, url.pathname.match(r.pattern), url, res);
      if (out !== undefined) send(res, 200, out, { 'Cache-Control': 'no-store' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? 'Something went wrong on our side. Please try again.' : e.message, errors: e.errors });
  }
});

server.listen(PORT, () => {
  console.log(`ANSORION store running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
