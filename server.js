'use strict';
// ANSORION store: storefront, customer accounts, order API and admin panel.
// Runs on Node.js 22.5+. Data lives in Postgres when DATABASE_URL is set (the live site),
// otherwise in a SQLite file in data/ (your own computer).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { openDatabase } = require('./lib/db');
const { garmentSVG } = require('./lib/garment');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const ON_VERCEL = !!process.env.VERCEL;
const HAS_SHARED_DB = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
// Vercel's code folder is read-only, so local files go to its temporary folder there.
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR)
  : ON_VERCEL ? path.join(os.tmpdir(), 'ansorion-data') : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads'); // older local photo uploads; new ones are stored in the database
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(DATA, { recursive: true });
if (ON_VERCEL && !HAS_SHARED_DB) console.warn('DATABASE_URL is not set: orders and logins are kept in temporary storage and will be lost.');
let db;
const ready = openDatabase(DATA).then((d) => { db = d; });
ready.catch((e) => console.error('Could not open the database:', e));

/* ---------------- passwords ---------------- */
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function verifyHash(pw, salt, hash) {
  if (typeof pw !== 'string' || !salt || !hash) return false;
  const h = Buffer.from(hashPassword(pw, salt), 'hex'); const want = Buffer.from(hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

/* ---------------- admin account ---------------- */
const ADMIN_FILE = path.join(DATA, 'admin.json');
function writeAdmin(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ username, salt, hash: hashPassword(password, salt) }, null, 2));
}
if (!ON_VERCEL && !fs.existsSync(ADMIN_FILE)) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  writeAdmin('admin', pw);
  fs.writeFileSync(path.join(DATA, 'ADMIN-LOGIN.txt'),
    `ANSORION admin panel\nURL: /admin\nUsername: admin\nPassword: ${pw}\n\nChange this password from Admin > Settings, then delete this file.\n`);
  console.log('Admin account created. Login details saved to data/ADMIN-LOGIN.txt');
}
function readAdmin() { return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); }
function checkAdminPassword(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  // On Vercel the password always comes from the ADMIN_PASSWORD environment variable.
  if (ON_VERCEL) {
    const want = process.env.ADMIN_PASSWORD;
    if (!want || username.trim().toLowerCase() !== 'admin') return false;
    const a = crypto.createHash('sha256').update(password).digest();
    const b = crypto.createHash('sha256').update(want).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const a = readAdmin();
  return username.trim() === a.username && verifyHash(password, a.salt, a.hash);
}

/* ---------------- helpers ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function invalid(errors) { const e = new HttpError(422, 'Please check the highlighted fields.'); e.errors = errors; return e; }

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
const nowText = () => new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC, same format as the database default

async function getSettings() {
  const out = {};
  for (const r of await db.all('SELECT key, value FROM settings')) out[r.key] = r.value;
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

async function newOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (;;) {
    const no = `ANS-${ymd}-${crypto.randomInt(1000, 9999)}`;
    if (!(await db.get('SELECT 1 AS x FROM orders WHERE order_no = ?', [no]))) return no;
  }
}

// Adds an "items" list to each order, in one query.
async function attachItems(orders, cols = 'order_id, name, size, qty, unit_price, line_total, image') {
  if (!orders.length) return orders;
  const rows = await db.all(`SELECT ${cols} FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY id`, orders.map((o) => o.id));
  const by = new Map(orders.map((o) => [o.id, (o.items = [])]));
  for (const r of rows) by.get(r.order_id)?.push(r);
  return orders;
}
const itemSummary = (items, sep = ', ') => items.map((i) => `${i.name} (${i.size}) x${i.qty}`).join(sep);

/* ---------------- sessions (stored in the shared database) ---------------- */
const SESSION_DAYS = 30;
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
function setCookie(res, req, name, value, maxAge, sameSite) {
  res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`);
}
async function isAdmin(req) {
  const t = parseCookies(req).ans_admin;
  if (!t) return false;
  const row = await db.get('SELECT expires_at FROM sessions WHERE token = ?', [t]);
  return !!row && Number(row.expires_at) > Date.now();
}
async function currentCustomer(req) {
  const t = parseCookies(req).ans_user;
  if (!t) return null;
  const row = await db.get(`SELECT c.* , s.expires_at FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token = ?`, [t]);
  return row && Number(row.expires_at) > Date.now() ? row : null;
}
async function startCustomerSession(req, res, customerId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('DELETE FROM customer_sessions WHERE expires_at < ?', [Date.now()]);
  await db.run('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)', [token, customerId, Date.now() + SESSION_DAYS * 864e5]);
  setCookie(res, req, 'ans_user', token, SESSION_DAYS * 86400, 'Lax');
}
const publicCustomer = (c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, created_at: c.created_at });

// Slows down password guessing (per server copy).
const loginFails = new Map();
function ipOf(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }
function guard(req, kind) {
  const f = loginFails.get(kind + ipOf(req));
  if (f && f.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
}
function failed(req, kind) {
  const k = kind + ipOf(req); const n = (loginFails.get(k)?.count || 0) + 1;
  loginFails.set(k, { count: n, until: n >= 8 ? Date.now() + 10 * 60 * 1000 : 0 });
}

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

// ---- public API
route('GET', /^\/api\/settings$/, async () => {
  const s = await getSettings();
  return {
    delivery_inside: int(s.delivery_inside), delivery_outside: int(s.delivery_outside),
    free_delivery_over: int(s.free_delivery_over), announcement: s.announcement, whatsapp: s.whatsapp,
    contact_phone: s.contact_phone, contact_email: s.contact_email, bkash_number: s.bkash_number,
    nagad_number: s.nagad_number, facebook_url: s.facebook_url,
  };
});

route('GET', /^\/api\/products$/, async (req, m, url) => {
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
  const rows = await db.all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY CASE WHEN stock > 0 THEN 0 ELSE 1 END, ${order} LIMIT ${limit}`, args);
  return rows.map(publicProduct);
});

route('GET', /^\/api\/categories$/, async () =>
  (await db.all('SELECT category AS name, COUNT(*) AS count, MIN(image) AS image FROM products WHERE active = 1 GROUP BY category ORDER BY MIN(id)'))
    .map((c) => ({ ...c, image: imageUrl(c.image) })));

route('GET', /^\/api\/products\/([a-z0-9-]+)$/, async (req, m) => {
  const p = await db.get('SELECT * FROM products WHERE slug = ? AND active = 1', [m[1]]);
  if (!p) throw new HttpError(404, 'Product not found.');
  return publicProduct(p);
});

route('POST', /^\/api\/orders$/, async (req) => {
  const body = await readBody(req);
  const me = await currentCustomer(req);
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
  if (Object.keys(errors).length) throw invalid(errors);

  // Prices and stock always come from the database, never from the browser.
  const lines = []; const want = new Map();
  for (const it of body.items.slice(0, 50)) {
    const p = await db.get('SELECT * FROM products WHERE id = ? AND active = 1', [int(it.productId)]);
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
  const s = await getSettings();
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const freeOver = int(s.free_delivery_over) || 0;
  const delivery = freeOver > 0 && subtotal >= freeOver ? 0 : int(zone === 'inside' ? s.delivery_inside : s.delivery_outside) || 0;
  const total = subtotal + delivery;
  const orderNo = await newOrderNo();

  await db.tx(async (t) => {
    const r = await t.get(`INSERT INTO orders (order_no, customer_id, customer_name, phone, email, address, city, zone, note, payment_method, payment_ref, subtotal, delivery_charge, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [orderNo, me ? me.id : null, name, phone, email, address, city, zone, str(c.note, 500), methods[method], method === 'cod' ? '' : ref, subtotal, delivery, total]);
    for (const l of lines) {
      const label = l.p.color_name ? `${l.p.name} - ${l.p.color_name}` : l.p.name;
      await t.run('INSERT INTO order_items (order_id, product_id, name, size, qty, unit_price, line_total, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [r.id, l.p.id, label, l.size, l.qty, l.unit, l.total, imageUrl(l.p.image)]);
      const u = await t.run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', [l.qty, l.p.id, l.qty]);
      if (u.changes !== 1) throw new HttpError(409, `${l.p.name} just sold out. Please update your cart.`);
    }
  });
  // Remember the delivery details on the account for next time.
  if (me && (!me.address || !me.city)) {
    await db.run('UPDATE customers SET address = ?, city = ? WHERE id = ?', [me.address || address, me.city || city, me.id]);
  }
  return { order_no: orderNo, subtotal, delivery_charge: delivery, total, payment_method: methods[method] };
});

route('GET', /^\/api\/orders\/track$/, async (req, m, url) => {
  const no = str(url.searchParams.get('order_no'), 30).toUpperCase();
  const phone = normalizePhone(url.searchParams.get('phone'));
  const o = phone && await db.get('SELECT * FROM orders WHERE order_no = ? AND phone = ?', [no, phone]);
  if (!o) throw new HttpError(404, 'We could not find an order with that number and phone. Check both and try again.');
  const items = await db.all('SELECT name, size, qty, line_total, image FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  return { order_no: o.order_no, status: o.status, created_at: o.created_at, updated_at: o.updated_at, total: o.total,
    delivery_charge: o.delivery_charge, payment_method: o.payment_method, customer_name: o.customer_name, city: o.city, items };
});

// Wholesale is switched off on the website for now (the form and page were removed).
const WHOLESALE_ENABLED = false;
route('POST', /^\/api\/wholesale$/, async (req) => {
  if (!WHOLESALE_ENABLED) throw new HttpError(404, 'Not found.');
  const b = await readBody(req);
  const full_name = str(b.full_name, 80), phone = normalizePhone(b.phone), email = str(b.email, 120);
  const errors = {};
  if (full_name.length < 2) errors.full_name = 'Enter your full name.';
  if (!phone) errors.phone = 'Enter a valid Bangladeshi mobile number.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address.';
  if (Object.keys(errors).length) throw invalid(errors);
  await db.run('INSERT INTO wholesale_requests (full_name, company, email, phone, products, quantity, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [full_name, str(b.company, 120), email, phone, str(b.products, 300), str(b.quantity, 60), str(b.message, 1500)]);
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
  if (Object.keys(errors).length) throw invalid(errors);
  await db.run('INSERT INTO messages (name, phone, email, topic, message) VALUES (?, ?, ?, ?, ?)', [name, phone || '', email, str(b.topic, 40) || 'General', message]);
  return { ok: true };
});

// ---- customer accounts
route('POST', /^\/api\/account\/signup$/, async (req, m, url, res) => {
  guard(req, 'c');
  const b = await readBody(req);
  const name = str(b.name, 80), phone = normalizePhone(b.phone), email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const errors = {};
  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!phone) errors.phone = 'Enter a valid Bangladeshi mobile number, like 01712345678.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address, or leave it empty.';
  if (password.length < 6) errors.password = 'Use at least 6 characters.';
  if (password.length > 200) errors.password = 'That password is too long.';
  if (Object.keys(errors).length) throw invalid(errors);
  if (await db.get('SELECT 1 AS x FROM customers WHERE phone = ?', [phone])) throw invalid({ phone: 'An account with this number already exists. Log in instead.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const r = await db.get('INSERT INTO customers (name, phone, email, salt, hash) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [name, phone, email, salt, hashPassword(password, salt)]);
  await startCustomerSession(req, res, r.id);
  return { ok: true };
});
route('POST', /^\/api\/account\/login$/, async (req, m, url, res) => {
  guard(req, 'c');
  const b = await readBody(req);
  const id = str(b.login, 120);
  const phone = normalizePhone(id);
  const c = phone ? await db.get('SELECT * FROM customers WHERE phone = ?', [phone])
    : id.includes('@') ? await db.get('SELECT * FROM customers WHERE email = ?', [id.toLowerCase()]) : null;
  if (!c || !verifyHash(b.password, c.salt, c.hash)) { failed(req, 'c'); throw new HttpError(401, 'Wrong mobile number or password.'); }
  loginFails.delete('c' + ipOf(req));
  await startCustomerSession(req, res, c.id);
  return { ok: true };
});
route('POST', /^\/api\/account\/logout$/, async (req, m, url, res) => {
  const t = parseCookies(req).ans_user;
  if (t) await db.run('DELETE FROM customer_sessions WHERE token = ?', [t]);
  setCookie(res, req, 'ans_user', '', 0, 'Lax');
  return { ok: true };
});
route('GET', /^\/api\/account\/me$/, async (req) => {
  const me = await currentCustomer(req);
  return me ? { loggedIn: true, customer: publicCustomer(me) } : { loggedIn: false };
});
route('GET', /^\/api\/account\/orders$/, async (req) => {
  const me = await currentCustomer(req);
  if (!me) throw new HttpError(401, 'Please log in to see your orders.');
  const orders = await db.all(`SELECT id, order_no, status, created_at, updated_at, subtotal, delivery_charge, total, payment_method,
    customer_name, phone, address, city, zone FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100`, [me.id]);
  await attachItems(orders);
  return orders.map(({ id, ...o }) => ({ ...o, items: o.items.map(({ order_id, ...i }) => i) }));
});
route('PUT', /^\/api\/account\/profile$/, async (req) => {
  const me = await currentCustomer(req);
  if (!me) throw new HttpError(401, 'Please log in again.');
  const b = await readBody(req);
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), address = str(b.address, 300), city = str(b.city, 60);
  const errors = {};
  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!emailOk(email)) errors.email = 'Enter a valid email address, or leave it empty.';
  if (Object.keys(errors).length) throw invalid(errors);
  await db.run('UPDATE customers SET name = ?, email = ?, address = ?, city = ? WHERE id = ?', [name, email, address, city, me.id]);
  return { ok: true };
});
route('POST', /^\/api\/account\/password$/, async (req, m, url, res) => {
  const me = await currentCustomer(req);
  if (!me) throw new HttpError(401, 'Please log in again.');
  const b = await readBody(req);
  if (!verifyHash(b.current, me.salt, me.hash)) throw invalid({ current: 'Your current password is wrong.' });
  if (typeof b.next !== 'string' || b.next.length < 6) throw invalid({ next: 'Use at least 6 characters.' });
  const salt = crypto.randomBytes(16).toString('hex');
  await db.run('UPDATE customers SET salt = ?, hash = ? WHERE id = ?', [salt, hashPassword(b.next, salt), me.id]);
  await db.run('DELETE FROM customer_sessions WHERE customer_id = ?', [me.id]);
  await startCustomerSession(req, res, me.id);
  return { ok: true };
});

// ---- admin auth
route('POST', /^\/api\/admin\/login$/, async (req, m, url, res) => {
  guard(req, 'a');
  const b = await readBody(req);
  if (ON_VERCEL && !process.env.ADMIN_PASSWORD) throw new HttpError(503, 'Admin password is not set up yet. Add ADMIN_PASSWORD in Vercel > Settings > Environment Variables, then redeploy.');
  if (!checkAdminPassword(b.username, b.password)) { failed(req, 'a'); throw new HttpError(401, 'Wrong username or password.'); }
  loginFails.delete('a' + ipOf(req));
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  await db.run('INSERT INTO sessions (token, expires_at) VALUES (?, ?)', [token, Date.now() + SESSION_DAYS * 864e5]);
  setCookie(res, req, 'ans_admin', token, SESSION_DAYS * 86400, 'Strict');
  return { ok: true };
});
route('POST', /^\/api\/admin\/logout$/, async (req, m, url, res) => {
  const t = parseCookies(req).ans_admin;
  if (t) await db.run('DELETE FROM sessions WHERE token = ?', [t]);
  setCookie(res, req, 'ans_admin', '', 0, 'Strict');
  return { ok: true };
});
route('GET', /^\/api\/admin\/me$/, async (req) => {
  const ok = await isAdmin(req);
  return { loggedIn: ok, username: ok ? 'admin' : null, shared_db: HAS_SHARED_DB || !ON_VERCEL };
});

// ---- admin data (all require login)
const A = { admin: true };
route('GET', /^\/api\/admin\/stats$/, async () => {
  const n = async (sql, a = []) => Number((await db.get(sql, a)).n);
  return {
    orders_total: await n('SELECT COUNT(*) AS n FROM orders'),
    orders_pending: await n("SELECT COUNT(*) AS n FROM orders WHERE status = 'Pending'"),
    orders_today: await n('SELECT COUNT(*) AS n FROM orders WHERE substr(created_at, 1, 10) = ?', [nowText().slice(0, 10)]),
    revenue: await n("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status <> 'Cancelled'"),
    revenue_delivered: await n("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status = 'Delivered'"),
    wholesale_new: await n("SELECT COUNT(*) AS n FROM wholesale_requests WHERE status = 'New'"),
    messages_unread: await n('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0'),
    customers: await n('SELECT COUNT(*) AS n FROM customers'),
    low_stock: await db.all('SELECT id, name, color_name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock ASC LIMIT 8'),
    by_status: await db.all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    recent: await db.all('SELECT id, order_no, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 6'),
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
route('GET', /^\/api\/admin\/orders$/, async (req, m, url) => {
  const { where, args } = orderQuery(url);
  const orders = await attachItems(await db.all(`SELECT o.* FROM orders o ${where} ORDER BY o.id DESC LIMIT 500`, args), 'order_id, name, size, qty');
  return orders.map(({ items, ...o }) => ({ ...o, item_count: items.reduce((a, i) => a + i.qty, 0), summary: itemSummary(items) }));
}, A);
route('GET', /^\/api\/admin\/orders\.csv$/, async (req, m, url, res) => {
  const { where, args } = orderQuery(url);
  const rows = await attachItems(await db.all(`SELECT o.* FROM orders o ${where} ORDER BY o.id DESC`, args), 'order_id, name, size, qty');
  for (const r of rows) r.items = itemSummary(r.items, '; ');
  const cols = ['order_no', 'created_at', 'status', 'customer_name', 'phone', 'email', 'address', 'city', 'zone', 'items', 'subtotal', 'delivery_charge', 'total', 'payment_method', 'payment_ref', 'note'];
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
  send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ansorion-orders-${new Date().toISOString().slice(0, 10)}.csv"` });
  return undefined;
}, A);
route('GET', /^\/api\/admin\/orders\/(\d+)$/, async (req, m) => {
  const o = await db.get('SELECT * FROM orders WHERE id = ?', [int(m[1])]);
  if (!o) throw new HttpError(404, 'Order not found.');
  o.items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  o.has_account = !!o.customer_id;
  return o;
}, A);
route('PATCH', /^\/api\/admin\/orders\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  const o = await db.get('SELECT * FROM orders WHERE id = ?', [int(m[1])]);
  if (!o) throw new HttpError(404, 'Order not found.');
  const status = b.status !== undefined ? b.status : o.status;
  if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status.');
  const note = b.admin_note !== undefined ? str(b.admin_note, 1000) : o.admin_note;
  await db.tx(async (t) => {
    // Cancelling puts the items back in stock; reopening a cancelled order takes them out again.
    if (status !== o.status && (status === 'Cancelled' || o.status === 'Cancelled')) {
      const sign = status === 'Cancelled' ? 1 : -1;
      for (const it of await t.all('SELECT product_id, qty FROM order_items WHERE order_id = ?', [o.id])) {
        const d = sign * it.qty;
        if (it.product_id) await t.run('UPDATE products SET stock = CASE WHEN stock + ? < 0 THEN 0 ELSE stock + ? END WHERE id = ?', [d, d, it.product_id]);
      }
    }
    await t.run('UPDATE orders SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?', [status, note, nowText(), o.id]);
  });
  return { ok: true };
}, A);
route('DELETE', /^\/api\/admin\/orders\/(\d+)$/, async (req, m) => {
  await db.tx(async (t) => {
    await t.run('DELETE FROM order_items WHERE order_id = ?', [int(m[1])]);
    await t.run('DELETE FROM orders WHERE id = ?', [int(m[1])]);
  });
  return { ok: true };
}, A);

route('GET', /^\/api\/admin\/wholesale$/, async () => db.all('SELECT * FROM wholesale_requests ORDER BY id DESC LIMIT 500'), A);
route('PATCH', /^\/api\/admin\/wholesale\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  if (!['New', 'Contacted', 'Deal closed', 'Not a fit'].includes(b.status)) throw new HttpError(422, 'Unknown status.');
  await db.run('UPDATE wholesale_requests SET status = ? WHERE id = ?', [b.status, int(m[1])]);
  return { ok: true };
}, A);
route('GET', /^\/api\/admin\/messages$/, async () => db.all('SELECT * FROM messages ORDER BY id DESC LIMIT 500'), A);
route('PATCH', /^\/api\/admin\/messages\/(\d+)$/, async (req, m) => {
  const b = await readBody(req);
  await db.run('UPDATE messages SET is_read = ? WHERE id = ?', [b.is_read ? 1 : 0, int(m[1])]);
  return { ok: true };
}, A);

route('GET', /^\/api\/admin\/products$/, async () =>
  (await db.all('SELECT * FROM products ORDER BY id DESC')).map((p) => ({ ...p, image_url: imageUrl(p.image) })), A);
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
  if (Object.keys(errors).length) throw invalid(errors);
  return { name, category, color_name: str(b.color_name, 40), description: str(b.description, 3000), price, sale_price: sale,
    stock, sizes, image, featured: b.featured ? 1 : 0, is_new: b.is_new ? 1 : 0, active: b.active === false ? 0 : 1 };
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'product'; }
route('POST', /^\/api\/admin\/products$/, async (req) => {
  const p = productInput(await readBody(req));
  let slug = slugify(`${p.name} ${p.color_name}`), n = 2;
  while (await db.get('SELECT 1 AS x FROM products WHERE slug = ?', [slug])) slug = `${slugify(`${p.name} ${p.color_name}`)}-${n++}`;
  const r = await db.get(`INSERT INTO products (slug, name, category, color_name, description, price, sale_price, stock, sizes, image, featured, is_new, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [slug, p.name, p.category, p.color_name, p.description, p.price, p.sale_price, p.stock, p.sizes, p.image, p.featured, p.is_new, p.active]);
  return { id: Number(r.id), slug };
}, A);
route('PUT', /^\/api\/admin\/products\/(\d+)$/, async (req, m) => {
  const p = productInput(await readBody(req));
  const r = await db.run(`UPDATE products SET name=?, category=?, color_name=?, description=?, price=?, sale_price=?, stock=?, sizes=?, image=?, featured=?, is_new=?, active=? WHERE id=?`,
    [p.name, p.category, p.color_name, p.description, p.price, p.sale_price, p.stock, p.sizes, p.image, p.featured, p.is_new, p.active, int(m[1])]);
  if (!r.changes) throw new HttpError(404, 'Product not found.');
  return { ok: true };
}, A);
route('DELETE', /^\/api\/admin\/products\/(\d+)$/, async (req, m) => {
  await db.run('DELETE FROM products WHERE id = ?', [int(m[1])]);
  return { ok: true };
}, A);
// Photos are stored in the database so every server copy can show them.
route('POST', /^\/api\/admin\/upload$/, async (req) => {
  const b = await readBody(req, 4 * 1024 * 1024);
  const mm = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
  if (!mm) throw new HttpError(422, 'Upload a JPG, PNG or WebP image.');
  const size = Buffer.byteLength(mm[2], 'base64');
  if (size > 3 * 1024 * 1024) throw new HttpError(413, 'Image must be under 3 MB.');
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${mm[1] === 'jpeg' ? 'jpg' : mm[1]}`;
  await db.run('INSERT INTO uploads (name, mime, data) VALUES (?, ?, ?)', [name, `image/${mm[1]}`, mm[2]]);
  return { path: `/uploads/${name}` };
}, A);

const SETTING_KEYS = ['delivery_inside', 'delivery_outside', 'free_delivery_over', 'announcement', 'whatsapp', 'contact_phone', 'contact_email', 'bkash_number', 'nagad_number', 'facebook_url'];
route('GET', /^\/api\/admin\/settings$/, async () => getSettings(), A);
route('PUT', /^\/api\/admin\/settings$/, async (req) => {
  const b = await readBody(req);
  const updates = [];
  for (const k of SETTING_KEYS) {
    if (b[k] === undefined) continue;
    let v = str(String(b[k]), 300);
    if (['delivery_inside', 'delivery_outside', 'free_delivery_over'].includes(k)) {
      const n = int(v); if (!(n >= 0)) throw new HttpError(422, 'Delivery charges must be 0 or more.'); v = String(n);
    }
    if (k === 'facebook_url' && v && !/^https:\/\//.test(v)) throw new HttpError(422, 'Facebook link must start with https://');
    updates.push([k, v]);
  }
  for (const [k, v] of updates) await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [k, v]);
  return { ok: true };
}, A);
route('POST', /^\/api\/admin\/password$/, async (req) => {
  if (ON_VERCEL) throw new HttpError(409, 'On the live site, change the password in Vercel: Settings > Environment Variables > ADMIN_PASSWORD, then redeploy.');
  const b = await readBody(req);
  const a = readAdmin();
  if (!checkAdminPassword(a.username, b.current)) throw new HttpError(401, 'Current password is wrong.');
  if (typeof b.next !== 'string' || b.next.length < 8) throw new HttpError(422, 'New password must be at least 8 characters.');
  writeAdmin(a.username, b.next);
  await db.run('DELETE FROM sessions');
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
async function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p.startsWith('/uploads/')) {
    const name = path.basename(p);
    const up = await db.get('SELECT mime, data FROM uploads WHERE name = ?', [name]);
    if (up) return send(res, 200, Buffer.from(up.data, 'base64'), { 'Content-Type': up.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    return serveFile(res, path.join(UPLOADS, name), 'public, max-age=604800');
  }
  const g = /^\/img\/garment\/([a-z]+)\/([0-9a-f]{6})\.svg$/i.exec(p);
  if (g) {
    const svg = garmentSVG(g[1], g[2]);
    if (!svg) return send(res, 404, 'Not found');
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  }
  if (p === '/') p = '/index.html';
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
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) await ready;
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      if (r.admin && !(await isAdmin(req))) throw new HttpError(401, 'Please log in again.');
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON.');
      }
      const out = await r.handler(req, url.pathname.match(r.pattern), url, res);
      if (out !== undefined) send(res, 200, out, { 'Cache-Control': 'no-store' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    await serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on our side. Please try again.' : e.message, errors: e.errors });
  }
});

server.listen(PORT, () => {
  console.log(`ANSORION store running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
