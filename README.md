# ANSORION Store

Online store for the ANSORION clothing brand: shop, cart, checkout, customer accounts, an info desk, and an admin panel where every order lands as a list.

Live site: https://ansorion.vercel.app

## Run it on your computer

Needs **Node.js 22.5 or newer**.

```bash
cd ansorion-store
npm install
npm start
```

- Store: http://localhost:3000
- Admin panel: http://localhost:3000/admin

On your computer the data is kept in a SQLite file in `data/`. On the first run the server creates the admin account and writes the login to `data/ADMIN-LOGIN.txt`.

## Database on the live site

Vercel runs several copies of the server at once and wipes their temporary storage, so the live site keeps everything (orders, customer accounts, logins, product photos, settings) in a **Postgres database** shared by all copies. The server uses it whenever the `DATABASE_URL` (or `POSTGRES_URL`) environment variable is set, and creates its tables on the first request. Without it, data on Vercel is temporary and will disappear.

Live-site environment variables (Vercel → Settings → Environment Variables):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (added automatically when you connect a Neon database in Vercel → Storage) |
| `ADMIN_PASSWORD` | Admin panel password (username is `admin`) |

## What's in it

| Page | What it does |
| --- | --- |
| `/` Home | Hero, categories, popular products, brand promise, new arrivals, info desk links |
| `/shop` | All products with category filters, search and sorting |
| `/product?slug=…` | Size picker, quantity, add to cart / buy now, stock level, related products |
| `/cart`, `/checkout` | Cart in the browser; checkout with delivery area (inside / outside Dhaka) and Cash on delivery, bKash or Nagad (with transaction ID). Logged-in customers get their details filled in. |
| `/order-success` | Order number and summary |
| `/account` | Customer sign up / log in (mobile number or email + password), their orders with live status, profile and delivery address, password change |
| `/wishlist` | Saved products (heart icon) |
| `/info` | Info desk: order tracking, size guide, delivery, exchange & returns, payment, FAQ, contact form |
| `/admin` | Dashboard, **Orders** list with full customer details and status updates, info desk messages, products (with photo upload), settings |

Mobile has a bottom bar (Home, Shop, Cart, Account, Info); a WhatsApp button appears once you add a number in Admin → Settings.

## How orders work

1. The customer checks out. The server re-checks every price and stock level from the database (the browser can't change prices), saves the order and lowers stock. If they're logged in, the order is linked to their account.
2. The order appears in **Admin → Orders** as *Pending*. The admin panel checks for new orders every 30 seconds and shows a notice.
3. Open an order to see name, phone, address, items, payment and transaction ID. Change the status (Confirmed → Shipped → Delivered) and add private notes. Cancelling returns the items to stock.
4. Customers see the status in **My account**, or on the Info desk with their order number and phone.
5. **Export CSV** downloads the order list for Excel.
6. **Invoices (PDF):** tick orders in Admin → Orders and click **Invoices (PDF)**, or open one order and click **Invoice (PDF)**. Invoices are laid out three per A4 page with cut lines (one slip goes in each parcel). **Download PDF** saves the file; **Print** prints directly. Orders with more than 4 different items show the first 3 and a "+N more items" line so each invoice fits its third of the page.

## Before going live

- **Products:** the 12 products are samples with drawn illustrations. Edit or delete them in Admin → Products and upload real photos (4:5 portrait works best).
- **Text to review:** delivery times, exchange policy and size chart (`public/info.html`) are sensible defaults; change them to match how you actually work.
- **Settings:** add delivery charges, phone, email, WhatsApp, bKash/Nagad numbers and your Facebook link in Admin → Settings.

## GitHub

Code lives at https://github.com/tahasanmahmud13/ansorion-store. Changes made with Claude Code are committed and pushed automatically at the end of each turn by `.claude/hooks/auto-push.ps1` (one folder above this repo). Every push redeploys Vercel. The `data/` folder is never pushed.

## Files

```
server.js          web server + API
lib/db.js          database (Postgres on the live site, SQLite locally), tables and sample products
lib/garment.js     drawn product illustrations (used until real photos are uploaded)
public/            store pages, styles and scripts
public/account.html  customer account page
public/admin/      admin panel
data/              local database and admin login (created on first run, never pushed)
```
