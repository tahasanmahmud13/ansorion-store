'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'ansorion.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      color_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      price INTEGER NOT NULL,
      sale_price INTEGER,
      stock INTEGER NOT NULL DEFAULT 0,
      sizes TEXT NOT NULL DEFAULT 'S,M,L,XL,XXL',
      image TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      zone TEXT NOT NULL,
      note TEXT DEFAULT '',
      payment_method TEXT NOT NULL,
      payment_ref TEXT DEFAULT '',
      subtotal INTEGER NOT NULL,
      delivery_charge INTEGER NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      image TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS wholesale_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      company TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT NOT NULL,
      products TEXT DEFAULT '',
      quantity TEXT DEFAULT '',
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      topic TEXT DEFAULT 'General',
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
  `);

  const defaults = {
    delivery_inside: '70',
    delivery_outside: '130',
    free_delivery_over: '0',
    announcement: 'Cash on delivery all over Bangladesh',
    whatsapp: '',
    contact_phone: '',
    contact_email: '',
    bkash_number: '',
    nagad_number: '',
    facebook_url: '',
  };
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count === 0) seedProducts(db);
  return db;
}

// Sample catalogue so the shop isn't empty on first run. Edit or delete these from the admin panel.
function seedProducts(db) {
  const TOPS = 'S,M,L,XL,XXL';
  const WAIST = '30,32,34,36,38';
  const items = [
    ['orion-essential-tee-night', 'Orion Essential Tee', 'T-Shirts', 'Night', 'gen:tee:1f2740', 890, 790, 40, TOPS, 1, 1,
      'Our everyday crew-neck tee. Combed cotton jersey with a soft hand feel, a regular fit and a clean ribbed collar that keeps its shape wash after wash.'],
    ['orion-essential-tee-bone', 'Orion Essential Tee', 'T-Shirts', 'Bone', 'gen:tee:e8e2d6', 890, 790, 35, TOPS, 1, 0,
      'Our everyday crew-neck tee in a warm off-white. Combed cotton jersey, regular fit, ribbed collar.'],
    ['orion-essential-tee-olive', 'Orion Essential Tee', 'T-Shirts', 'Olive', 'gen:tee:5b6248', 890, 790, 30, TOPS, 0, 1,
      'Our everyday crew-neck tee in a muted olive. Combed cotton jersey, regular fit, ribbed collar.'],
    ['polaris-pique-polo-midnight', 'Polaris Piqué Polo', 'Polos', 'Midnight', 'gen:polo:18213a', 1390, 1190, 25, TOPS, 1, 0,
      'A two-button polo in breathable cotton piqué. Structured collar, tonal buttons and a tidy fit that works with chinos or denim.'],
    ['polaris-pique-polo-white', 'Polaris Piqué Polo', 'Polos', 'White', 'gen:polo:f4f4f2', 1390, 1190, 25, TOPS, 0, 0,
      'A two-button polo in breathable cotton piqué, in clean white.'],
    ['belt-line-oxford-shirt-sky', 'Belt Line Oxford Shirt', 'Shirts', 'Sky', 'gen:shirt:a9bed6', 1890, 1590, 20, TOPS, 1, 1,
      'A soft oxford-weave shirt with a button-down collar, chest pocket and a straight hem you can wear in or out.'],
    ['belt-line-oxford-shirt-white', 'Belt Line Oxford Shirt', 'Shirts', 'White', 'gen:shirt:f1f2f4', 1890, null, 20, TOPS, 0, 0,
      'A soft oxford-weave shirt in white with a button-down collar and chest pocket.'],
    ['nebula-heavyweight-hoodie-graphite', 'Nebula Heavyweight Hoodie', 'Hoodies', 'Graphite', 'gen:hoodie:2e323b', 2490, 2190, 18, TOPS, 1, 1,
      'A heavyweight brushed-fleece hoodie with a lined hood, flat drawcords, kangaroo pocket and ribbed cuffs and hem.'],
    ['nebula-heavyweight-hoodie-sand', 'Nebula Heavyweight Hoodie', 'Hoodies', 'Sand', 'gen:hoodie:c8b79a', 2490, 2190, 0, TOPS, 0, 0,
      'A heavyweight brushed-fleece hoodie in sand, with a lined hood and kangaroo pocket.'],
    ['meridian-field-jacket-khaki', 'Meridian Field Jacket', 'Jackets', 'Khaki', 'gen:jacket:8a7a5a', 3490, 2990, 12, TOPS, 0, 1,
      'A cotton-twill field jacket with a stand collar, full zip, two flap chest pockets and side hand pockets.'],
    ['equinox-chino-trouser-stone', 'Equinox Chino Trouser', 'Trousers', 'Stone', 'gen:trouser:b9af9c', 1890, 1690, 22, WAIST, 1, 0,
      'Stretch cotton chinos with a tapered leg, belt loops and slanted side pockets. Sized by waist in inches.'],
    ['equinox-chino-trouser-navy', 'Equinox Chino Trouser', 'Trousers', 'Navy', 'gen:trouser:232b45', 1890, 1690, 22, WAIST, 0, 1,
      'Stretch cotton chinos in navy with a tapered leg and slanted side pockets. Sized by waist in inches.'],
  ];
  const stmt = db.prepare(`INSERT INTO products
    (slug, name, category, color_name, image, price, sale_price, stock, sizes, featured, is_new, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  for (const it of items) stmt.run(...it);
  db.exec('COMMIT');
}

module.exports = { openDatabase };
