/* ANSORION storefront script: shared layout, cart, wishlist and each page's behaviour. */
(() => {
'use strict';

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = (n) => '৳' + Number(n || 0).toLocaleString('en-IN');
const qs = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
async function api(path, opts = {}) {
  const go = () => fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const safe = !opts.method || opts.method === 'GET';
  let res;
  // Reading data is retried twice after a network blip or a server hiccup; sending (like placing an order) is not.
  for (let i = 0; ; i++) {
    try { res = await go(); if (!safe || res.status < 500 || i >= 2) break; } catch (e) { if (!safe || i >= 2) throw new Error('Could not reach the store. Check your connection and try again.'); }
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.errors = data.errors; throw e; }
  return data;
}
let settingsP;
const settings = () => (settingsP ||= api('/api/settings').catch(() => ({ delivery_inside: 70, delivery_outside: 130 })));
const imgCls = (src) => (src.startsWith('/uploads/') ? 'photo' : '');
const effPrice = (p) => (p.sale_price && p.sale_price < p.price ? p.sale_price : p.price);

const I = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-6.5 8 6.5V20h-5.5v-5h-5v5H4z"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8.5 4L4 6.5l1.8 4 2.2-1V20h8V9.5l2.2 1 1.8-4L15.5 4c-.6 1.6-1.9 2.5-3.5 2.5S9.1 5.6 8.5 4z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 15.5L15.5 3 21 8.5 8.5 21z"/><path d="M7 11.5l2 2M10 8.5l2 2M13 5.5l2 2"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wa: '<svg viewBox="0 0 32 32"><path d="M16 3.5A12.4 12.4 0 0 0 5.3 22.2L3.6 28.5l6.5-1.7A12.4 12.4 0 1 0 16 3.5zm0 22.6a10.2 10.2 0 0 1-5.2-1.4l-.4-.2-3.8 1 1-3.7-.2-.4A10.2 10.2 0 1 1 16 26.1zm5.6-7.6c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.4 8.4 0 0 1-4.2-3.6c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.5 3.5 0 0 0-1.1 2.6 6.1 6.1 0 0 0 1.3 3.2 13.9 13.9 0 0 0 5.3 4.7c2 .9 2.8.9 3.8.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3z"/></svg>',
};
// ANSORION logo: the swept "A" mark and the wordmark, drawn in the current text colour.
const MARK_P = '<path d="M578,499 L772,279 L857,378 L804,397 L772,360 L709,432 Q640,462 578,499 Z"/><path d="M465,593 C640,460 880,345 1135,338 C990,352 820,420 672,540 L655,541 C585,541 525,566 465,593 Z"/><path d="M847,451 L898,426 L1044,594 C950,555 850,538 744,543 C800,522 850,514 898,514 Z"/>';
const WORD_P = '<path d="M300,692 L363,627 L376,627 L438,692 L412,692 L370,648 L327,692 Z"/><path d="M460,692 L460,627 L477,627 L535,668 L535,627 L551,627 L551,692 L536,692 L479,650 L479,692 Z"/><path d="M673,627 L606,627 Q587,627 587,644.5 Q587,662 606,662 L651,662 Q657,662 657,669 Q657,676 651,676 L587,676 L587,692 L654,692 Q675,692 675,669 Q675,648 654,648 L609,648 Q603,648 603,644 Q603,640 609,640 L668,640 Z"/><path d="M738,627 L776,627 A32.5,32.5 0 0 1 776,692 L738,692 A32.5,32.5 0 0 1 738,627 Z M743,640 A19.5,19.5 0 0 0 743,679 L771,679 A19.5,19.5 0 0 0 771,640 Z"/><path d="M842,692 L842,627 L913,627 Q933,627 933,647 Q933,666 913,667 L936,692 L911,692 L888,667 L860,667 L860,692 Z M860,640 L860,654 L907,654 Q914,654 914,647 Q914,640 907,640 Z"/><path d="M971,627 h17 v65 h-17 Z"/><path d="M1049,627 L1087,627 A32.5,32.5 0 0 1 1087,692 L1049,692 A32.5,32.5 0 0 1 1049,627 Z M1054,640 A19.5,19.5 0 0 0 1054,679 L1082,679 A19.5,19.5 0 0 0 1082,640 Z"/><path d="M1149,692 L1149,627 L1166,627 L1224,668 L1224,627 L1240,627 L1240,692 L1225,692 L1168,650 L1168,692 Z"/>';
const LOGO = () => `<svg class="lm" viewBox="458 272 684 326" fill="currentColor" aria-hidden="true">${MARK_P}</svg><svg class="lw" viewBox="296 624 948 72" fill="currentColor" fill-rule="evenodd" aria-hidden="true">${WORD_P}</svg>`;

/* ---------- cart & wishlist ---------- */
const cart = {
  all() { return store.get('ans_cart', []); },
  save(items) { store.set('ans_cart', items); updateCounts(); },
  count() { return this.all().reduce((a, i) => a + i.qty, 0); },
  add(p, size, qty = 1) {
    const items = this.all();
    const ex = items.find((i) => i.id === p.id && i.size === size);
    const max = Math.max(1, Math.min(20, p.stock ?? 20));
    if (ex) ex.qty = Math.min(max, ex.qty + qty);
    else items.push({ id: p.id, slug: p.slug, name: p.name, color: p.color, size, qty: Math.min(max, qty), price: effPrice(p), image: p.image });
    this.save(items);
  },
  setQty(idx, qty) { const it = this.all(); if (!it[idx]) return; it[idx].qty = Math.max(1, Math.min(20, qty)); this.save(it); },
  remove(idx) { const it = this.all(); it.splice(idx, 1); this.save(it); },
  clear() { this.save([]); },
};
const wish = {
  all() { return store.get('ans_wish', []); },
  has(id) { return this.all().includes(id); },
  toggle(id) { const w = this.all(); const i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.unshift(id); store.set('ans_wish', w); updateCounts(); return i < 0; },
};
function updateCounts() {
  $$('[data-count="cart"]').forEach((el) => { el.textContent = cart.count(); el.dataset.n = cart.count(); });
  $$('[data-count="wish"]').forEach((el) => { el.textContent = wish.all().length; el.dataset.n = wish.all().length; });
}

/* ---------- layout ---------- */
function renderLayout() {
  const page = document.body.dataset.page;
  const cur = (p) => (p === page ? ' aria-current="page"' : '');
  const hdr = $('#site-header');
  if (hdr) hdr.outerHTML = `
    <div class="announce" id="announce">Cash on delivery all over Bangladesh</div>
    <header class="hdr"><div class="wrap hdr-in">
      <button class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false">${I.menu}</button>
      <a class="logo" href="/" aria-label="ANSORION home">${LOGO()}</a>
      <nav class="main-nav" aria-label="Main">
        <a href="/"${cur('home')}>Home</a><a href="/shop"${cur('shop')}>Shop</a><a href="/shop?new=1">New arrivals</a>
        <a href="/info"${cur('info')}>Info desk</a>
      </nav>
      <div class="hdr-actions">
        <a class="icon-btn desk" href="/shop?focus=search" aria-label="Search">${I.search}</a>
        <a class="icon-btn desk" href="/wishlist" aria-label="Wishlist">${I.heart}<span class="count" data-count="wish">0</span></a>
        <a class="icon-btn desk" href="/account" aria-label="My account"${cur('account')}>${I.user}</a>
        <a class="icon-btn" href="/cart" aria-label="Cart">${I.bag}<span class="count" data-count="cart">0</span></a>
      </div>
    </div></header>
    <aside class="drawer" id="drawer" aria-label="Menu">
      <div class="drawer-head"><a class="logo" href="/">${LOGO()}</a><button class="icon-btn" id="drawerClose" aria-label="Close menu">${I.close}</button></div>
      <nav><a href="/">Home</a><a href="/shop">Shop all</a><a href="/shop?new=1">New arrivals</a><a href="/info">Info desk</a><a href="/account">My account</a><a href="/info#track">Track your order</a><a href="/wishlist">Wishlist</a></nav>
      <div class="drawer-foot">Essentials, aligned.</div>
    </aside><div class="drawer-bg" id="drawerBg"></div>`;
  const ftr = $('#site-footer');
  if (ftr) ftr.outerHTML = `
    <footer class="ftr"><div class="wrap">
      <div class="ftr-grid">
        <div style="display:flex;flex-direction:column;gap:14px">
          <a class="logo" href="/">${LOGO()}</a>
          <p style="max-width:34ch">Modern essentials, cut clean and made to last. Designed and sold in Bangladesh.</p>
          <p id="ftrContact"></p>
        </div>
        <div><h4>Shop</h4><ul><li><a href="/shop">All products</a></li><li><a href="/shop?new=1">New arrivals</a></li><li><a href="/shop?category=T-Shirts">T-Shirts</a></li><li><a href="/shop?category=Shirts">Shirts</a></li><li><a href="/shop?category=Hoodies">Hoodies</a></li></ul></div>
        <div><h4>Info desk</h4><ul><li><a href="/account">My account</a></li><li><a href="/info#track">Track order</a></li><li><a href="/info#size-guide">Size guide</a></li><li><a href="/info#delivery">Delivery</a></li><li><a href="/info#exchange">Exchange &amp; returns</a></li><li><a href="/info#contact">Contact us</a></li><li id="ftrFb" hidden><a target="_blank" rel="noopener" href="#">Facebook</a></li></ul></div>
      </div>
      <div class="ftr-bottom"><span>© ${new Date().getFullYear()} ANSORION. All rights reserved.</span><span class="belt"><i></i><i></i><i></i></span></div>
    </div></footer>
    <nav class="bnav" aria-label="Quick links">
      <a href="/"${cur('home')}>${I.home}Home</a>
      <a href="/shop"${cur('shop')}>${I.shop}Shop</a>
      <a href="/cart"${cur('cart') || cur('checkout')}>${I.bag}Cart<span class="count" data-count="cart">0</span></a>
      <a href="/account"${cur('account')}>${I.user}Account</a>
      <a href="/info"${cur('info')}>${I.info}Info</a>
    </nav>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const drawer = $('#drawer'), bg = $('#drawerBg'), btn = $('#menuBtn');
  const setOpen = (o) => { drawer?.classList.toggle('open', o); bg?.classList.toggle('open', o); btn?.setAttribute('aria-expanded', o); };
  btn?.addEventListener('click', () => setOpen(true));
  $('#drawerClose')?.addEventListener('click', () => setOpen(false));
  bg?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  updateCounts();

  settings().then((s) => {
    if (s.announcement) $('#announce').textContent = s.announcement; else $('#announce')?.remove();
    const bits = [s.contact_phone, s.contact_email].filter(Boolean).map(esc);
    if (bits.length) $('#ftrContact').innerHTML = bits.join('<br>');
    if (s.facebook_url) { const li = $('#ftrFb'); li.hidden = false; li.querySelector('a').href = s.facebook_url; }
    if (s.whatsapp) {
      const n = s.whatsapp.replace(/\D/g, '').replace(/^0/, '880');
      document.body.insertAdjacentHTML('beforeend', `<a class="chat-fab" href="https://wa.me/${n}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp"><span>Contact us</span><b>${I.wa}</b></a>`);
    }
  });
}

let toastT;
function toast(html) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- product card ---------- */
function pct(p) { return p.sale_price && p.sale_price < p.price ? Math.round((1 - p.sale_price / p.price) * 100) : 0; }
function card(p) {
  const off = pct(p);
  return `<article class="pcard${p.in_stock ? '' : ' soldout'}" data-id="${p.id}">
    <a class="pimg" href="/product?slug=${encodeURIComponent(p.slug)}" aria-label="${esc(p.name)} ${esc(p.color)}">
      <img loading="lazy" class="${imgCls(p.image)}" src="${esc(p.image)}" alt="${esc(p.name)} in ${esc(p.color)}">
      <span class="badges">${off ? `<span class="badge">-${off}%</span>` : ''}${p.is_new && p.in_stock ? '<span class="badge new">New</span>' : ''}${p.in_stock ? '' : '<span class="badge out">Sold out</span>'}</span>
    </a>
    <button class="wish" type="button" aria-label="Save to wishlist" aria-pressed="${wish.has(p.id)}" data-wish="${p.id}">${I.heart}</button>
    <div class="pbody">
      <span class="pcat">${esc(p.category)}${p.color ? ' · ' + esc(p.color) : ''}</span>
      <a class="pname" href="/product?slug=${encodeURIComponent(p.slug)}">${esc(p.name)}</a>
      <div class="price">${off ? `<s>${tk(p.price)}</s>` : ''}<b>${tk(effPrice(p))}</b></div>
      ${p.in_stock ? `<button class="btn ghost" type="button" data-quick="${p.id}">Add to cart</button>` : `<a class="btn ghost" href="/product?slug=${encodeURIComponent(p.slug)}">View details</a>`}
    </div>
  </article>`;
}
const productCache = new Map();
function renderCards(el, list, emptyHtml) {
  list.forEach((p) => productCache.set(p.id, p));
  el.innerHTML = list.length ? list.map(card).join('') : (emptyHtml || '<div class="empty">No products yet.</div>');
}
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-wish]');
  if (w) { const on = wish.toggle(Number(w.dataset.wish)); w.setAttribute('aria-pressed', on); toast(on ? 'Saved to your wishlist <a href="/wishlist">View</a>' : 'Removed from your wishlist'); if (document.body.dataset.page === 'wishlist' && !on) initWishlist(); return; }
  const q = e.target.closest('[data-quick]');
  if (q) { const p = productCache.get(Number(q.dataset.quick)); if (p) sizeSheet(p); }
});

function sizeSheet(p) {
  if (p.sizes.length === 1) { cart.add(p, p.sizes[0]); return toast(`Added to cart <a href="/cart">View cart</a>`); }
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Choose a size">
    <div class="sheet-top"><div class="ci"><img class="${imgCls(p.image)}" src="${esc(p.image)}" alt=""></div>
      <div><b>${esc(p.name)}</b><div style="color:var(--muted);font-size:13.5px">${esc(p.color)} · ${tk(effPrice(p))}</div></div>
      <button class="icon-btn" data-x aria-label="Close">${I.close}</button></div>
    <div class="opt-label">Choose a size <a href="/info#size-guide">Size guide</a></div>
    <div class="sizes">${p.sizes.map((s) => `<button class="size" type="button" aria-pressed="false">${esc(s)}</button>`).join('')}</div>
    <button class="btn block" data-add disabled>Choose a size</button></div>`;
  document.body.appendChild(bg);
  let size = null;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-x]')) return close();
    const s = e.target.closest('.size');
    if (s) { $$('.size', bg).forEach((b) => b.setAttribute('aria-pressed', b === s)); size = s.textContent; const a = $('[data-add]', bg); a.disabled = false; a.textContent = `Add size ${size} to cart`; }
    if (e.target.closest('[data-add]') && size) { cart.add(p, size); close(); toast(`Added to cart <a href="/cart">View cart</a>`); }
  });
  bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('.size', bg)?.focus();
}

/* ---------- form helpers ---------- */
function showErrors(form, errors = {}) {
  $$('.field', form).forEach((f) => { f.classList.remove('has-err'); const er = $('.err', f); if (er) er.textContent = ''; });
  for (const [k, msg] of Object.entries(errors)) {
    const inp = form.querySelector(`[name="${k}"]`) || form.querySelector(`[data-err="${k}"]`);
    const f = inp?.closest('.field') || form.querySelector(`[data-err="${k}"]`);
    if (f) { f.classList.add('has-err'); let er = $('.err', f); if (!er) { er = document.createElement('span'); er.className = 'err'; f.appendChild(er); } er.textContent = msg; }
  }
  const first = form.querySelector('.has-err .input, .has-err input');
  first?.focus();
}
function bindSimpleForm(form, url, okText) {
  const msg = $('.form-msg', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    msg.hidden = true;
    try {
      await api(url, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      form.reset(); showErrors(form, {});
      msg.className = 'form-msg ok'; msg.textContent = okText; msg.hidden = false;
    } catch (err) {
      showErrors(form, err.errors); msg.className = 'form-msg bad'; msg.textContent = err.message; msg.hidden = false;
    } finally { btn.disabled = false; }
  });
}

/* ---------- pages ---------- */
function starfield(canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, stars = [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { bet: [22, 12], mei: [46, 2], bel: [70, 18], alt: [38, 52], aln: [47, 49], min: [56, 46], sai: [30, 88], rig: [74, 84] };
  const L = [['bet', 'mei'], ['mei', 'bel'], ['bet', 'alt'], ['bel', 'min'], ['alt', 'aln'], ['aln', 'min'], ['alt', 'sai'], ['min', 'rig']];
  function size() {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    stars = Array.from({ length: Math.round(w * h / 2600) }, () => ({ x: rnd() * w, y: rnd() * h, r: rnd() * 1.3 + .3, a: .08 + rnd() * .45, p: rnd() * 6.28 }));
  }
  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const st of stars) { ctx.fillStyle = `rgba(228,230,236,${st.a * (reduce ? 1 : .75 + .25 * Math.sin(t / 1400 + st.p))})`; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 7); ctx.fill(); }
    const k = Math.min(h * .82 / 90, w * .5 / 75), ox = w > 900 ? w * .5 - 10 * k : w - 72 * k, oy = h * .08;
    const P = (n) => [ox + S[n][0] * k, oy + S[n][1] * k];
    ctx.strokeStyle = 'rgba(210,188,142,.16)'; ctx.lineWidth = 1.2;
    for (const [a, b] of L) { ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke(); }
    for (const n in S) {
      const [x, y] = P(n), belt = ['alt', 'aln', 'min'].includes(n), r = belt ? 3.2 : 2.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6); g.addColorStop(0, 'rgba(240,226,190,.4)'); g.addColorStop(1, 'rgba(240,226,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 6, 0, 7); ctx.fill();
      ctx.fillStyle = belt ? '#E6D3A8' : '#E4E6EC'; ctx.beginPath(); ctx.arc(x, y, r * .6, 0, 7); ctx.fill();
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  size(); addEventListener('resize', size); requestAnimationFrame(draw);
}

async function initHome() {
  starfield($('#heroSky'));
  const [featured, fresh, cats] = await Promise.all([api('/api/products?featured=1&limit=12'), api('/api/products?new=1&sort=new&limit=8'), api('/api/categories')]);
  renderCards($('#popular'), featured);
  renderCards($('#newArrivals'), fresh);
  $('#cats').innerHTML = cats.map((c) => `<a class="cat" href="/shop?category=${encodeURIComponent(c.name)}"><img src="${esc(c.image)}" alt="" class="${imgCls(c.image)}"><b>${esc(c.name)}</b><span>${c.count} item${c.count > 1 ? 's' : ''}</span></a>`).join('');
  // hero spotlight cycles through featured pieces
  const spot = featured.filter((p) => p.in_stock).slice(0, 4);
  const hc = $('#heroCard'); if (!spot.length || !hc) return;
  let i = 0;
  const dots = $('#heroDots');
  dots.innerHTML = spot.map((_, n) => `<button type="button" aria-label="Show item ${n + 1}"></button>`).join('');
  const show = (n) => {
    i = n; const p = spot[n];
    hc.innerHTML = `<span class="eyebrow">${esc(p.category)}</span><img src="${esc(p.image)}" alt="${esc(p.name)}" class="${imgCls(p.image)}">
      <div class="hc-meta"><div><b>${esc(p.name)}</b><span>${esc(p.color)}</span></div><span class="hc-price">${tk(effPrice(p))}</span></div>`;
    hc.href = '/product?slug=' + encodeURIComponent(p.slug);
    $$('button', dots).forEach((d, k) => d.setAttribute('aria-current', k === n));
  };
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show($$('button', dots).indexOf(b)); });
  show(0);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => show((i + 1) % spot.length), 4500);
}

async function initShop() {
  const cats = await api('/api/categories');
  const state = { category: qs.get('category') || '', new: qs.get('new') === '1', sort: qs.get('sort') || '', q: qs.get('q') || '' };
  const chips = $('#chips');
  chips.innerHTML = [`<button class="chip" data-c="">All</button>`, `<button class="chip" data-c="__new">New arrivals</button>`,
    ...cats.map((c) => `<button class="chip" data-c="${esc(c.name)}">${esc(c.name)}</button>`)].join('');
  $('#sort').value = state.sort; $('#q').value = state.q;
  if (qs.get('focus') === 'search') $('#q').focus();
  async function load() {
    $$('.chip', chips).forEach((c) => c.setAttribute('aria-pressed', state.new ? c.dataset.c === '__new' : c.dataset.c === state.category));
    const p = new URLSearchParams();
    if (state.category) p.set('category', state.category);
    if (state.new) p.set('new', '1');
    if (state.sort) p.set('sort', state.sort);
    if (state.q) p.set('q', state.q);
    history.replaceState(null, '', '/shop' + (p.toString() ? '?' + p : ''));
    $('#shopTitle').textContent = state.new ? 'New arrivals' : state.category || 'Shop all';
    const list = await api('/api/products?' + p);
    $('#count').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
    renderCards($('#grid'), list, `<div class="empty" style="grid-column:1/-1"><b>No products match.</b><span>Try another category or clear your search.</span><button class="btn ghost" id="clearAll">Show all products</button></div>`);
    $('#clearAll')?.addEventListener('click', () => { Object.assign(state, { category: '', new: false, q: '' }); $('#q').value = ''; load(); });
  }
  chips.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.c === '__new') { state.new = true; state.category = ''; } else { state.new = false; state.category = c.dataset.c; }
    load();
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
  let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
  load();
}

async function initProduct() {
  const slug = qs.get('slug');
  const box = $('#pd');
  let p;
  try { p = await api('/api/products/' + encodeURIComponent(slug || '')); }
  catch { box.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>We couldn't find that product.</b><a class="btn" href="/shop">Back to the shop</a></div>`; return; }
  productCache.set(p.id, p);
  document.title = `${p.name} - ${p.color} | ANSORION`;
  const off = pct(p);
  const s = await settings();
  const stockLine = !p.in_stock ? '<span class="stock-line out">Sold out</span>' : p.stock <= 5 ? `<span class="stock-line low">Only ${p.stock} left</span>` : '<span class="stock-line ok">In stock</span>';
  box.innerHTML = `
    <div class="pd-img"><img class="${imgCls(p.image)}" src="${esc(p.image)}" alt="${esc(p.name)} in ${esc(p.color)}">
      <span class="badges" style="top:16px;left:16px">${off ? `<span class="badge">-${off}%</span>` : ''}${p.is_new ? '<span class="badge new">New</span>' : ''}</span>
      <button class="wish" type="button" style="top:14px;right:14px" aria-label="Save to wishlist" aria-pressed="${wish.has(p.id)}" data-wish="${p.id}">${I.heart}</button></div>
    <div class="pd-info">
      <div class="crumbs"><a href="/shop">Shop</a> / <a href="/shop?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a></div>
      <div style="display:flex;flex-direction:column;gap:8px"><h1>${esc(p.name)}</h1><span style="color:var(--muted)">Colour: <b style="color:var(--ink)">${esc(p.color)}</b></span></div>
      <div class="pd-price">${off ? `<s>${tk(p.price)}</s>` : ''}<b>${tk(effPrice(p))}</b>${off ? `<span class="save">Save ${tk(p.price - effPrice(p))}</span>` : ''}</div>
      ${stockLine}
      <div style="display:flex;flex-direction:column;gap:10px"><div class="opt-label">Size <a href="/info#size-guide">Size guide</a></div>
        <div class="sizes" id="sizes">${p.sizes.map((z) => `<button class="size" type="button" aria-pressed="false" ${p.in_stock ? '' : 'disabled'}>${esc(z)}</button>`).join('')}</div>
        <span class="err" id="sizeErr" style="color:var(--bad);font-size:13px"></span></div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="opt-label">Quantity</span>
        <div class="qty"><button type="button" data-q="-1" aria-label="Decrease">−</button><input id="qty" type="number" value="1" min="1" max="${Math.min(20, p.stock || 1)}" aria-label="Quantity"><button type="button" data-q="1" aria-label="Increase">+</button></div></div>
      <div class="buy-row">
        <button class="btn" id="addBtn" ${p.in_stock ? '' : 'disabled'}>${p.in_stock ? 'Add to cart' : 'Sold out'}</button>
        <button class="btn gold" id="buyBtn" ${p.in_stock ? '' : 'disabled'}>Buy now</button>
      </div>
      <div class="pd-perks">
        <div>${I.truck}<span>Delivery inside Dhaka ${tk(s.delivery_inside)}, outside Dhaka ${tk(s.delivery_outside)}.</span></div>
        <div>${I.cash}<span>Cash on delivery available. bKash and Nagad accepted.</span></div>
        <div>${I.swap}<span>Size exchange within 3 days. <a href="/info#exchange">How it works</a></span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px"><b>About this piece</b><p class="pd-desc">${esc(p.description)}</p></div>
    </div>`;
  let size = null;
  $('#sizes').addEventListener('click', (e) => {
    const b = e.target.closest('.size'); if (!b) return;
    $$('.size', $('#sizes')).forEach((x) => x.setAttribute('aria-pressed', x === b)); size = b.textContent; $('#sizeErr').textContent = '';
  });
  const q = $('#qty');
  box.addEventListener('click', (e) => { const d = e.target.closest('[data-q]'); if (d) q.value = Math.max(1, Math.min(Number(q.max), Number(q.value) + Number(d.dataset.q))); });
  const add = () => { if (!size) { $('#sizeErr').textContent = 'Choose a size first.'; $('#sizes .size')?.focus(); return false; } cart.add(p, size, Math.max(1, Number(q.value) || 1)); return true; };
  $('#addBtn').addEventListener('click', () => { if (add()) toast(`Added to cart <a href="/cart">View cart</a>`); });
  $('#buyBtn').addEventListener('click', () => { if (add()) location.href = '/checkout'; });

  const rel = (await api('/api/products?category=' + encodeURIComponent(p.category))).filter((x) => x.id !== p.id);
  const more = rel.length < 4 ? (await api('/api/products?featured=1')).filter((x) => x.id !== p.id && !rel.some((r) => r.id === x.id)) : [];
  renderCards($('#related'), [...rel, ...more].slice(0, 8));
}

async function refreshCartPrices() {
  const items = cart.all(); if (!items.length) return items;
  const fresh = await api('/api/products?ids=' + [...new Set(items.map((i) => i.id))].join(',')).catch(() => null);
  if (!fresh) return items;
  const byId = new Map(fresh.map((p) => [p.id, p]));
  const kept = items.filter((i) => byId.has(i.id)).map((i) => { const p = byId.get(i.id); return { ...i, price: effPrice(p), image: p.image, stock: p.stock, name: p.name, color: p.color }; });
  cart.save(kept.map(({ stock, ...rest }) => rest));
  return kept;
}

async function initCart() {
  const s = await settings();
  async function draw() {
    const items = await refreshCartPrices();
    const list = $('#cartList'), sum = $('#cartSummary');
    if (!items.length) {
      $('#cartGrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Your cart is empty.</b><span>Find something you'll wear every week.</span><a class="btn" href="/shop">Start shopping</a></div>`;
      return;
    }
    list.innerHTML = items.map((it, i) => `<div class="cline">
      <a class="ci" href="/product?slug=${encodeURIComponent(it.slug)}"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""></a>
      <div class="cn"><a href="/product?slug=${encodeURIComponent(it.slug)}">${esc(it.name)}</a><small>${esc(it.color)} · Size ${esc(it.size)} · ${tk(it.price)} each</small>
        ${it.stock !== undefined && it.stock < it.qty ? `<small style="color:var(--bad);font-weight:700">Only ${it.stock} left. Lower the quantity.</small>` : ''}
        <div class="qty"><button type="button" data-i="${i}" data-d="-1" aria-label="Decrease">−</button><input type="number" value="${it.qty}" data-i="${i}" aria-label="Quantity"><button type="button" data-i="${i}" data-d="1" aria-label="Increase">+</button></div></div>
      <div class="cp"><span>${tk(it.price * it.qty)}</span><button class="linkbtn" data-rm="${i}">Remove</button></div></div>`).join('');
    const sub = items.reduce((a, i) => a + i.price * i.qty, 0);
    const free = s.free_delivery_over > 0 && sub >= s.free_delivery_over;
    sum.innerHTML = `<h3>Order summary</h3>
      <div class="srow"><span>Subtotal (${items.reduce((a, i) => a + i.qty, 0)} items)</span><b>${tk(sub)}</b></div>
      <div class="srow"><span>Delivery</span><b>${free ? 'Free' : `${tk(s.delivery_inside)} – ${tk(s.delivery_outside)}`}</b></div>
      <p style="color:var(--muted);font-size:13px">Delivery is set at checkout: ${tk(s.delivery_inside)} inside Dhaka, ${tk(s.delivery_outside)} outside.${s.free_delivery_over > 0 ? ` Free on orders over ${tk(s.free_delivery_over)}.` : ''}</p>
      <a class="btn block" href="/checkout">Go to checkout</a><a class="btn ghost block" href="/shop">Keep shopping</a>`;
  }
  $('#cartGrid').addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]'); const r = e.target.closest('[data-rm]');
    if (d) { const it = cart.all()[d.dataset.i]; cart.setQty(Number(d.dataset.i), it.qty + Number(d.dataset.d)); draw(); }
    if (r) { cart.remove(Number(r.dataset.rm)); draw(); }
  });
  $('#cartGrid').addEventListener('change', (e) => { const inp = e.target.closest('input[data-i]'); if (inp) { cart.setQty(Number(inp.dataset.i), Number(inp.value) || 1); draw(); } });
  draw();
}

async function initCheckout() {
  const s = await settings();
  const items = await refreshCartPrices();
  if (!items.length) { $('#coGrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Your cart is empty.</b><a class="btn" href="/shop">Start shopping</a></div>`; return; }
  const form = $('#coForm');
  $('#zIn').textContent = tk(s.delivery_inside); $('#zOut').textContent = tk(s.delivery_outside);
  const sub = items.reduce((a, i) => a + i.price * i.qty, 0);
  const free = s.free_delivery_over > 0 && sub >= s.free_delivery_over;
  function summary() {
    const zone = form.zone.value;
    const del = !zone ? null : free ? 0 : zone === 'inside' ? s.delivery_inside : s.delivery_outside;
    $('#coSummary').innerHTML = `<h3>Your order</h3>
      <div class="sum-items">${items.map((it) => `<div class="sum-item"><div class="ci"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""></div>
        <div><b style="font-weight:700">${esc(it.name)}</b><div style="color:var(--muted)">${esc(it.color)} · ${esc(it.size)} × ${it.qty}</div></div><b>${tk(it.price * it.qty)}</b></div>`).join('')}</div>
      <div class="srow"><span>Subtotal</span><b>${tk(sub)}</b></div>
      <div class="srow"><span>Delivery</span><b>${del === null ? 'Choose area' : del === 0 ? 'Free' : tk(del)}</b></div>
      <div class="srow total"><span>Total</span><b>${tk(sub + (del || 0))}</b></div>
      <button class="btn block" type="submit" form="coForm" id="placeBtn">Place order${del === null ? '' : ' · ' + tk(sub + del)}</button>
      <p style="color:var(--muted);font-size:12.5px">We'll call to confirm your order before it ships.</p>`;
  }
  function payHelp() {
    const m = form.method.value; const box = $('#payHelp');
    if (m === 'cod' || !m) { box.hidden = true; return; }
    const num = m === 'bkash' ? s.bkash_number : s.nagad_number; const name = m === 'bkash' ? 'bKash' : 'Nagad';
    box.hidden = false;
    $('#payText').innerHTML = num ? `Send the total to our ${name} number <b>${esc(num)}</b> using <b>Send Money</b>, then enter the transaction ID below.` : `Pay by ${name}, then enter the transaction ID below. We'll share our ${name} number when we call to confirm.`;
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'zone') summary(); if (e.target.name === 'method') payHelp(); });
  summary(); payHelp();
  // Logged-in customers get their details filled in; others get a nudge to log in.
  api('/api/account/me').then((r) => {
    if (r.loggedIn) {
      const c = r.customer;
      for (const k of ['name', 'phone', 'email', 'address', 'city']) if (form[k] && !form[k].value && c[k]) form[k].value = c[k];
      if (/dhaka/i.test(c.city || '') && !form.zone.value) { form.zone.value = 'inside'; summary(); }
      form.insertAdjacentHTML('afterbegin', `<p class="co-acc">Ordering as <b>${esc(c.name)}</b>. This order will be saved to <a href="/account">your account</a>.</p>`);
    } else {
      form.insertAdjacentHTML('afterbegin', `<p class="co-acc">Have an account? <a href="/account?next=/checkout">Log in</a> to fill in your details and keep track of this order.</p>`);
    }
  }).catch(() => {});
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'Placing your order…';
    const msg = $('#coMsg'); msg.hidden = true;
    const f = new FormData(form);
    const body = {
      customer: { name: f.get('name'), phone: f.get('phone'), email: f.get('email'), address: f.get('address'), city: f.get('city'), zone: f.get('zone'), note: f.get('note') },
      payment: { method: f.get('method'), ref: f.get('payment_ref') },
      items: cart.all().map((i) => ({ productId: i.id, size: i.size, qty: i.qty })),
    };
    try {
      const r = await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
      try { sessionStorage.setItem('ans_last_order', JSON.stringify({ ...r, phone: f.get('phone'), items: cart.all() })); } catch {}
      cart.clear();
      location.href = '/order-success?no=' + encodeURIComponent(r.order_no);
    } catch (err) {
      showErrors(form, err.errors);
      msg.textContent = err.message; msg.hidden = false; msg.scrollIntoView({ block: 'center', behavior: 'smooth' });
      summary();
    }
  });
}

function initSuccess() {
  const no = qs.get('no') || '';
  let last = null; try { last = JSON.parse(sessionStorage.getItem('ans_last_order')); } catch {}
  $('#orderNo').textContent = no;
  if (last && last.order_no === no) {
    $('#successItems').innerHTML = last.items.map((it) => `<div class="sum-item"><div class="ci"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""></div><div><b style="font-weight:700">${esc(it.name)}</b><div style="color:var(--muted)">${esc(it.color)} · ${esc(it.size)} × ${it.qty}</div></div><b>${tk(it.price * it.qty)}</b></div>`).join('')
      + `<div class="srow"><span>Delivery</span><b>${last.delivery_charge ? tk(last.delivery_charge) : 'Free'}</b></div><div class="srow total"><span>Total · ${esc(last.payment_method)}</span><b>${tk(last.total)}</b></div>`;
    $('#trackLink').href = `/info?order_no=${encodeURIComponent(no)}&phone=${encodeURIComponent(last.phone)}#track`;
  }
}

async function initWishlist() {
  const ids = wish.all();
  const grid = $('#grid');
  if (!ids.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Your wishlist is empty.</b><span>Tap the heart on any product to save it here.</span><a class="btn" href="/shop">Browse the shop</a></div>`; return; }
  const list = await api('/api/products?ids=' + ids.join(','));
  list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  renderCards(grid, list);
}

function initInfo() {
  const s = settingsP || settings();
  s.then((st) => {
    $$('[data-set="inside"]').forEach((e) => (e.textContent = tk(st.delivery_inside)));
    $$('[data-set="outside"]').forEach((e) => (e.textContent = tk(st.delivery_outside)));
    const c = [st.contact_phone && `Phone: ${esc(st.contact_phone)}`, st.contact_email && `Email: ${esc(st.contact_email)}`].filter(Boolean);
    if (c.length) $('#contactLines').innerHTML = c.join('<br>');
  });
  const tf = $('#trackForm');
  async function track(no, phone) {
    const out = $('#trackOut'); out.hidden = false; out.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const o = await api(`/api/orders/track?order_no=${encodeURIComponent(no)}&phone=${encodeURIComponent(phone)}`);
      const order = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
      const at = order.indexOf(o.status);
      out.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><span class="order-no">${esc(o.order_no)}</span><span class="status-pill st-${esc(o.status)}">${esc(o.status)}</span></div>
        ${o.status === 'Cancelled' ? '<p style="color:var(--bad)">This order was cancelled. Contact us if you think this is a mistake.</p>' :
        `<div class="steps-track">${order.map((x, n) => `<div class="${n <= at ? 'done' : ''}">${x}</div>`).join('')}</div>`}
        <div class="sum-items">${o.items.map((it) => `<div class="sum-item"><div class="ci"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""></div><div><b style="font-weight:700">${esc(it.name)}</b><div style="color:var(--muted)">Size ${esc(it.size)} × ${it.qty}</div></div><b>${tk(it.line_total)}</b></div>`).join('')}</div>
        <div class="srow total"><span>Total · ${esc(o.payment_method)}</span><b>${tk(o.total)}</b></div>
        <p style="color:var(--muted);font-size:13px">Placed ${new Date(o.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · Delivering to ${esc(o.city)}</p>`;
    } catch (err) { out.innerHTML = `<div class="form-msg bad">${esc(err.message)}</div>`; }
  }
  tf.addEventListener('submit', (e) => { e.preventDefault(); track(tf.order_no.value.trim(), tf.phone.value.trim()); });
  if (qs.get('order_no') && qs.get('phone')) { tf.order_no.value = qs.get('order_no'); tf.phone.value = qs.get('phone'); track(qs.get('order_no'), qs.get('phone')); }
  bindSimpleForm($('#contactForm'), '/api/messages', 'Message sent. We usually reply within a day.');
}


/* ---------- customer account ---------- */
const fmtDate = (s) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
function bindAccountForm(form, url, method, onOk) {
  const msg = $('.form-msg', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form); btn.disabled = true; msg.hidden = true;
    try {
      await api(url, { method, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      showErrors(form, {});
      await onOk(msg);
    } catch (err) {
      showErrors(form, err.errors); msg.className = 'form-msg bad'; msg.textContent = err.message; msg.hidden = false;
    } finally { btn.disabled = false; }
  });
}
function orderCard(o) {
  const steps = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
  const at = steps.indexOf(o.status);
  return `<article class="my-order">
    <div class="my-order-head"><div><span class="order-no">${esc(o.order_no)}</span><small>Placed ${fmtDate(o.created_at)} · ${esc(o.payment_method)}</small></div><span class="status-pill st-${esc(o.status)}">${esc(o.status)}</span></div>
    ${o.status === 'Cancelled' ? '<p style="color:var(--bad);font-size:14px">This order was cancelled. Contact us if you think this is a mistake.</p>'
      : `<div class="steps-track">${steps.map((x, n) => `<div class="${n <= at ? 'done' : ''}">${x}</div>`).join('')}</div>`}
    <div class="sum-items">${o.items.map((it) => `<div class="sum-item"><div class="ci"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""></div><div><b style="font-weight:700">${esc(it.name)}</b><div style="color:var(--muted)">Size ${esc(it.size)} × ${it.qty}</div></div><b>${tk(it.line_total)}</b></div>`).join('')}</div>
    <div class="srow"><span>Delivery to ${esc(o.city)}</span><b>${o.delivery_charge ? tk(o.delivery_charge) : 'Free'}</b></div>
    <div class="srow total"><span>Total</span><b>${tk(o.total)}</b></div>
  </article>`;
}
async function initAccount() {
  const me = await api('/api/account/me');
  const next = qs.get('next');
  const goNext = () => { location.href = next && /^\/[a-z0-9/?=&#-]*$/i.test(next) ? next : '/account'; };
  if (!me.loggedIn) {
    $('#authBox').hidden = false;
    const tabs = { login: [$('#tabLogin'), $('#loginForm')], signup: [$('#tabSignup'), $('#signupForm')] };
    const show = (k) => { for (const [n, [t, f]] of Object.entries(tabs)) { t.setAttribute('aria-selected', n === k); f.hidden = n !== k; } $('#accTitle').textContent = k === 'login' ? 'Log in' : 'Create account'; };
    $('#tabLogin').addEventListener('click', () => show('login'));
    $('#tabSignup').addEventListener('click', () => show('signup'));
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
    show(qs.get('tab') === 'signup' ? 'signup' : 'login');
    $('#accLead').textContent = 'See your orders, track deliveries and check out faster.';
    bindAccountForm($('#loginForm'), '/api/account/login', 'POST', goNext);
    bindAccountForm($('#signupForm'), '/api/account/signup', 'POST', goNext);
    return;
  }
  const c = me.customer;
  $('#accBox').hidden = false;
  $('#accTitle').textContent = `Hi, ${c.name.split(' ')[0]}`;
  $('#accLead').textContent = 'Your orders, delivery details and password, all in one place.';
  $('#accAvatar').textContent = c.name.trim().charAt(0).toUpperCase();
  $('#accName').textContent = c.name; $('#accPhone').textContent = c.phone;
  const pf = $('#profileForm');
  pf.name.value = c.name; pf.email.value = c.email || ''; pf.city.value = c.city || ''; pf.address.value = c.address || ''; $('#p-phone').value = c.phone;
  const tab = (k) => { $$('[data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === k)); $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== k)); };
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
  $('#logoutBtn').addEventListener('click', async () => { await api('/api/account/logout', { method: 'POST' }).catch(() => {}); location.href = '/account'; });
  bindAccountForm(pf, '/api/account/profile', 'PUT', (msg) => {
    $('#accName').textContent = pf.name.value; msg.className = 'form-msg ok'; msg.textContent = 'Saved. We\'ll use these details at checkout.'; msg.hidden = false;
  });
  bindAccountForm($('#pwForm'), '/api/account/password', 'POST', (msg) => {
    $('#pwForm').reset(); msg.className = 'form-msg ok'; msg.textContent = 'Password updated.'; msg.hidden = false;
  });
  const orders = await api('/api/account/orders');
  $('#myOrders').innerHTML = orders.length ? orders.map(orderCard).join('')
    : `<div class="empty"><b>No orders yet.</b><span>Orders you place while logged in will show up here. For an order placed without logging in, use <a href="/info#track">Track order</a>.</span><a class="btn" href="/shop">Start shopping</a></div>`;
}

/* ---------- boot ---------- */
renderLayout();
const pages = { home: initHome, shop: initShop, product: initProduct, cart: initCart, checkout: initCheckout, success: initSuccess, wishlist: initWishlist, info: initInfo, account: initAccount };
const run = pages[document.body.dataset.page];
if (run) Promise.resolve(run()).catch((e) => { console.error(e); toast('Could not load this page. Check your connection and refresh.'); });
})();
