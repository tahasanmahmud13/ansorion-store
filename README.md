# ANSORION Store

Online store for the ANSORION clothing brand: shop, cart, checkout, wholesale requests, an info desk, and an admin panel where every order lands as a list.

## Run it

Needs **Node.js 22.5 or newer** (no `npm install` needed: it uses Node's built-in SQLite database).

```bash
cd ansorion-store
npm start
```

- Store: http://localhost:3000
- Admin panel: http://localhost:3000/admin

On the first run the server creates the admin account and writes the login to `data/ADMIN-LOGIN.txt`. Log in, change the password under **Settings**, then delete that file.

## What's in it

| Page | What it does |
| --- | --- |
| `/` Home | Hero, categories, popular products, brand promise, new arrivals, info desk links |
| `/shop` | All products with category filters, search and sorting |
| `/product?slug=…` | Size picker, quantity, add to cart / buy now, stock level, related products |
| `/cart`, `/checkout` | Cart in the browser; checkout with delivery area (inside / outside Dhaka) and Cash on delivery, bKash or Nagad (with transaction ID) |
| `/order-success` | Order number and summary |
| `/wishlist` | Saved products (heart icon) |
| `/info` | Info desk: order tracking, size guide, delivery, exchange & returns, payment, FAQ, contact form |
| `/admin` | Dashboard, **Orders** list with full customer details and status updates, wholesale leads, info desk messages, products (with photo upload), settings |

Mobile has a bottom bar (Home, Shop, Wishlist, Cart, Info) like the reference site; a WhatsApp button appears once you add a number in Admin → Settings.

## How orders work

1. The customer checks out. The server re-checks every price and stock level from the database (the browser can't change prices), saves the order and lowers stock.
2. The order appears in **Admin → Orders** as *Pending*. The admin panel checks for new orders every 30 seconds and shows a notice.
3. Open an order to see name, phone, address, items, payment and transaction ID. Change the status (Confirmed → Shipped → Delivered) and add private notes. Cancelling returns the items to stock.
4. Customers can track the status on the Info desk with their order number and phone.
5. **Export CSV** downloads the order list for Excel.

## Before going live

- **Products:** the 12 products are samples with drawn illustrations. Edit or delete them in Admin → Products and upload real photos (4:5 portrait works best).
- **Text to review:** delivery times, exchange policy, size chart and wholesale tiers (`public/info.html`, `public/wholesale.html`) are sensible defaults; change them to match how you actually work.
- **Settings:** add delivery charges, phone, email, WhatsApp, bKash/Nagad numbers and your Facebook link in Admin → Settings.
- **Hosting:** any host that runs Node.js 22.5+ with a persistent disk works (a VPS, Railway, Render with a disk, etc.). The database and uploaded photos live in `data/`; back that folder up. Serve it over HTTPS. Set `PORT` if your host needs a specific port, and `DATA_DIR` to keep data somewhere else.

## GitHub

Code lives at https://github.com/tahasanmahmud13/ansorion-store. Changes made with Claude Code are committed and pushed automatically at the end of each turn by `.claude/hooks/auto-push.ps1` (one folder above this repo). The `data/` folder is never pushed.

## Files

```
server.js          web server + API
lib/db.js          database tables and sample products
lib/garment.js     drawn product illustrations (used until real photos are uploaded)
public/            store pages, styles and scripts
public/admin/      admin panel
public/assets/logo.svg, logo-white.svg   ANSORION logo
data/              database, uploads, admin login (created on first run)
```
