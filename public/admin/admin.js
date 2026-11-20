/* ANSORION admin panel */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = (n) => '৳' + Number(n || 0).toLocaleString('en-IN');
const when = (s) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const ago = (s) => { const m = Math.round((Date.now() - new Date(String(s).replace(' ', 'T') + 'Z')) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(s); };
const stc = (s) => 'st st-' + String(s).split(' ')[0];
const imgCls = (src) => (String(src).startsWith('/uploads/') ? 'photo' : '');
const STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/password')) { showLogin(); throw new Error('Please log in again.'); }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.errors = data.errors; throw e; }
  return data;
}
let tt;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2800); }

/* ---------- auth ---------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lu').focus(); stopPoll(); }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; route(); startPoll(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('#loginMsg'); m.hidden = true;
  try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('#lu').value.trim(), password: $('#lp').value }) }); $('#lp').value = ''; showApp(); }
  catch (err) { m.textContent = err.message; m.hidden = false; }
});
async function logout() { await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {}); showLogin(); }
$('#logout').addEventListener('click', logout);

/* ---------- polling for new orders ---------- */
let pollT, lastTotal = null, baseTitle = document.title;
async function poll() {
  try {
    const s = await api('/api/admin/stats');
    badge('#navOrders', s.orders_pending); badge('#navMsg', s.messages_unread);
    if (lastTotal !== null && s.orders_total > lastTotal) {
      const n = s.orders_total - lastTotal;
      toast(`${n} new order${n > 1 ? 's' : ''} received`);
      document.title = `(${n}) New order · ${baseTitle}`;
      if (current === 'orders' || current === 'dashboard') views[current]();
    }
    lastTotal = s.orders_total;
    return s;
  } catch { return null; }
}
function badge(sel, n) { const b = $(sel); b.hidden = !n; b.textContent = n; }
function startPoll() { stopPoll(); poll(); pollT = setInterval(poll, 30000); }
function stopPoll() { clearInterval(pollT); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = baseTitle; });

/* ---------- router ---------- */
let current = 'dashboard';
const main = $('#main');
function route() {
  const v = (location.hash.slice(1) || 'dashboard');
  current = views[v] ? v : 'dashboard';
  $$('#snav a').forEach((a) => a.setAttribute('aria-current', a.dataset.v === current ? 'page' : 'false'));
  views[current]();
}
addEventListener('hashchange', route);
const head = (title, sub, right = '') => `<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${right}<button class="b sm mobile-logout" data-logout>Log out</button></div></div>`;
main.addEventListener('click', (e) => { if (e.target.closest('[data-logout]')) logout(); });

/* ---------- dashboard ---------- */
const views = {};
views.dashboard = async () => {
  main.innerHTML = head('Dashboard', 'A quick look at the store.') + '<div class="empty">Loading…</div>';
  const s = await poll(); if (!s) return;
  const total = s.by_status.reduce((a, r) => a + r.n, 0);
  main.innerHTML = head('Dashboard', 'A quick look at the store.', '<a class="b primary" href="#orders">Open orders</a>') + `
    <div class="stats">
      <a class="card stat ${s.orders_pending ? 'attn' : ''}" href="#orders"><span>Pending orders</span><b>${s.orders_pending}</b><small>Need a confirmation call</small></a>
      <a class="card stat" href="#orders"><span>Orders today</span><b>${s.orders_today}</b><small>${s.orders_total} orders all time</small></a>
      <div class="card stat"><span>Sales value</span><b>${tk(s.revenue)}</b><small>${tk(s.revenue_delivered)} delivered · excludes cancelled</small></div>
      <a class="card stat ${s.messages_unread ? 'attn' : ''}" href="#messages"><span>Messages waiting</span><b>${s.messages_unread}</b><small>From the info desk contact form</small></a>
    </div>
    <div class="dash">
      <div class="card"><div class="card-h"><h2>Latest orders</h2><a class="b sm" href="#orders">See all</a></div>
        ${s.recent.length ? s.recent.map((o) => `<a class="list-row" href="#orders" data-open="${o.id}"><div><b>${esc(o.order_no)}</b><div class="muted small">${esc(o.customer_name)} · ${ago(o.created_at)}</div></div><div style="display:flex;gap:10px;align-items:center"><b class="num">${tk(o.total)}</b><span class="${stc(o.status)}">${esc(o.status)}</span></div></a>`).join('') : '<div class="empty">No orders yet. They will appear here the moment a customer checks out.</div>'}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card"><div class="card-h"><h2>Orders by status</h2></div>
          ${total ? `<div class="bar">${STATUSES.map((st) => { const n = s.by_status.find((r) => r.status === st)?.n || 0; return n ? `<span class="c-${st}" style="width:${(n / total) * 100}%" title="${st}: ${n}"></span>` : ''; }).join('')}</div>
          <div class="legend">${STATUSES.map((st) => `<span><i class="c-${st}"></i>${st} ${s.by_status.find((r) => r.status === st)?.n || 0}</span>`).join('')}</div>` : '<div class="empty">No orders yet.</div>'}
        </div>
        <div class="card"><div class="card-h"><h2>Low stock</h2><a class="b sm" href="#products">Products</a></div>
          ${s.low_stock.length ? s.low_stock.map((p) => `<div class="list-row"><span>${esc(p.name)}${p.color_name ? ' · ' + esc(p.color_name) : ''}</span><span class="${p.stock ? 'stock-low' : 'stock-out'} num">${p.stock ? p.stock + ' left' : 'Sold out'}</span></div>`).join('') : '<div class="empty">Everything has more than 5 in stock.</div>'}
        </div>
      </div>
    </div>`;
  $$('[data-open]', main).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); location.hash = 'orders'; openOrder(Number(a.dataset.open)); }));
};

/* ---------- orders ---------- */
const oState = { status: '', q: '' };
const picked = new Set();
const openInvoices = (ids) => window.open('/admin/invoices?ids=' + ids.join(','), '_blank');
views.orders = async () => {
  main.innerHTML = head('Orders', 'Every order from the store, newest first. Click an order to see full details and update its status.',
    '<button class="b primary" id="invBtn" type="button" disabled>Invoices (PDF)</button><a class="b" id="csv" href="#">Export CSV</a>') + `
    <div class="tabs" id="otabs"></div>
    <div class="tools"><input class="in" id="oq" type="search" placeholder="Search order number, name, phone or city" value="${esc(oState.q)}"></div>
    <div class="card"><div class="tw" id="otable"><div class="empty">Loading…</div></div></div>`;
  const all = await api('/api/admin/orders');
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((o) => o.status === s).length]));
  const tabs = $('#otabs');
  tabs.innerHTML = `<button class="tab" data-s="">All<em>${all.length}</em></button>` + STATUSES.map((s) => `<button class="tab" data-s="${s}">${s}<em>${counts[s]}</em></button>`).join('');
  const draw = () => {
    $$('.tab', tabs).forEach((t) => t.setAttribute('aria-pressed', t.dataset.s === oState.status));
    const q = oState.q.toLowerCase();
    const list = all.filter((o) => (!oState.status || o.status === oState.status) && (!q || [o.order_no, o.customer_name, o.phone, o.city].some((v) => String(v).toLowerCase().includes(q))));
    const p = new URLSearchParams(); if (oState.status) p.set('status', oState.status); if (oState.q) p.set('q', oState.q);
    $('#csv').href = '/api/admin/orders.csv?' + p;
    $('#otable').innerHTML = list.length ? `<table class="t"><thead><tr><th class="ck"><input type="checkbox" id="ckAll" aria-label="Select all orders in this list"></th><th>Order</th><th>Customer</th><th>Items</th><th class="r">Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>
      ${list.map((o) => `<tr data-id="${o.id}">
        <td class="ck"><input type="checkbox" data-pick="${o.id}" aria-label="Select ${esc(o.order_no)}" ${picked.has(o.id) ? 'checked' : ''}></td>
        <td><b>${esc(o.order_no)}</b><div class="muted small">${when(o.created_at)}</div></td>
        <td data-l="Customer"><b>${esc(o.customer_name)}</b><div class="muted small">${esc(o.phone)} · ${esc(o.city)}</div></td>
        <td class="hide-m"><span class="sumtxt">${esc(o.summary)}</span><div class="muted small">${o.item_count} pcs</div></td>
        <td class="r num" data-l="Total"><b>${tk(o.total)}</b></td>
        <td class="hide-m">${esc(o.payment_method)}${o.payment_ref ? `<div class="muted small">${esc(o.payment_ref)}</div>` : ''}</td>
        <td><span class="${stc(o.status)}">${esc(o.status)}</span></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${all.length ? 'No orders match this filter.' : 'No orders yet. When a customer checks out, the order appears here with all their details.'}</div>`;
    syncPick(list);
  };
  const syncPick = (list) => {
    const b = $('#invBtn'); b.disabled = !picked.size;
    b.textContent = picked.size ? `Invoices (PDF) · ${picked.size}` : 'Invoices (PDF)';
    const ck = $('#ckAll'); if (ck) { const n = list.filter((o) => picked.has(o.id)).length; ck.checked = n > 0 && n === list.length; ck.indeterminate = n > 0 && n < list.length; }
  };
  $('#otable').addEventListener('change', (e) => {
    const boxes = [...$$('[data-pick]', $('#otable'))];
    if (e.target.id === 'ckAll') boxes.forEach((x) => { x.checked = e.target.checked; const id = Number(x.dataset.pick); x.checked ? picked.add(id) : picked.delete(id); });
    else if (e.target.dataset.pick) { const id = Number(e.target.dataset.pick); e.target.checked ? picked.add(id) : picked.delete(id); }
    const cur = boxes.map((x) => Number(x.dataset.pick));
    syncPick(all.filter((o) => cur.includes(o.id)));
  });
  // Newest order first in the PDF, same as the list.
  $('#invBtn').addEventListener('click', () => openInvoices(all.filter((o) => picked.has(o.id)).map((o) => o.id)));
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) { oState.status = t.dataset.s; draw(); } });
  let qt; $('#oq').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { oState.q = e.target.value.trim(); draw(); }, 200); });
  $('#otable').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('.ck')) openOrder(Number(tr.dataset.id)); });
  draw();
};

function modal(title, bodyHtml, actionsHtml = '') {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><div class="actions">${actionsHtml}<button class="x" data-x aria-label="Close">×</button></div></div><div class="modal-b">${bodyHtml}</div></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
  $('[data-x]', bg).focus();
  return { el: bg, close };
}

async function openOrder(id) {
  const o = await api('/api/admin/orders/' + id);
  const m = modal(`Order ${o.order_no}`, `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="${stc(o.status)}">${esc(o.status)}</span><span class="muted small">Placed ${when(o.created_at)}${o.updated_at !== o.created_at ? ` · updated ${when(o.updated_at)}` : ''}</span></div>
    <div><div class="sec-t">Customer</div>
      <dl class="kv" style="margin:10px 0 0">
        <dt>Name</dt><dd><b>${esc(o.customer_name)}</b></dd>
        <dt>Phone</dt><dd><a href="tel:${esc(o.phone)}"><b>${esc(o.phone)}</b></a></dd>
        ${o.email ? `<dt>Email</dt><dd>${esc(o.email)}</dd>` : ''}
        <dt>Address</dt><dd>${esc(o.address)}</dd>
        <dt>City</dt><dd>${esc(o.city)} · ${o.zone === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka'}</dd>
        ${o.note ? `<dt>Customer note</dt><dd>${esc(o.note)}</dd>` : ''}
        <dt>Payment</dt><dd>${esc(o.payment_method)}${o.payment_ref ? ` · TrxID <b>${esc(o.payment_ref)}</b>` : ''}</dd>
      </dl></div>
    <div><div class="sec-t" style="margin-bottom:10px">Items</div><div class="items">
      ${o.items.map((it) => `<div class="item"><img class="${imgCls(it.image)}" src="${esc(it.image)}" alt=""><div><b>${esc(it.name)}</b><div class="muted small">Size ${esc(it.size)} · ${it.qty} × ${tk(it.unit_price)}</div></div><b class="num">${tk(it.line_total)}</b></div>`).join('')}
    </div></div>
    <div class="totals"><div><span class="muted">Subtotal</span><span>${tk(o.subtotal)}</span></div><div><span class="muted">Delivery</span><span>${tk(o.delivery_charge)}</span></div><div class="grand"><span>Total to collect</span><span>${tk(o.total)}</span></div></div>
    <form id="ostat" class="card no-print" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div class="sec-t">Update order</div>
      <label class="fld"><span>Status</span><select class="in" name="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="fld"><span>Private note <small>(only admins see this)</small></span><textarea class="in" name="admin_note" placeholder="e.g. Called at 3pm, confirmed. Courier: Pathao #12345">${esc(o.admin_note)}</textarea></label>
      <p class="muted small">Setting an order to Cancelled puts its items back in stock.</p>
      <div class="actions"><button class="b primary" type="submit">Save changes</button><button class="b danger" type="button" id="odel">Delete order</button></div>
    </form>`, '<button class="b sm primary" id="oinv">Invoice (PDF)</button><button class="b sm" id="oprint">Print</button>');
  $('#oprint', m.el).addEventListener('click', () => window.print());
  $('#oinv', m.el).addEventListener('click', () => openInvoices([id]));
  $('#ostat', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('/api/admin/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status: f.get('status'), admin_note: f.get('admin_note') }) }); toast('Order updated'); m.close(); poll(); if (views[current]) views[current](); }
    catch (err) { toast(err.message); }
  });
  let armed = false;
  $('#odel', m.el).addEventListener('click', async (e) => {
    if (!armed) { armed = true; e.target.textContent = 'Click again to delete for good'; return; }
    await api('/api/admin/orders/' + id, { method: 'DELETE' }); toast('Order deleted'); m.close(); lastTotal = null; poll(); views[current]();
  });
}

/* ---------- wholesale ---------- */
views.wholesale = async () => {
  main.innerHTML = head('Wholesale requests', 'Leads from the wholesale forms on the home page and wholesale page.') + '<div class="card"><div class="tw" id="wt"><div class="empty">Loading…</div></div></div>';
  const list = await api('/api/admin/wholesale');
  const opts = ['New', 'Contacted', 'Deal closed', 'Not a fit'];
  $('#wt').innerHTML = list.length ? `<table class="t"><thead><tr><th>Received</th><th>Contact</th><th>Wants</th><th>Status</th></tr></thead><tbody>
    ${list.map((w) => `<tr data-id="${w.id}"><td><b>${ago(w.created_at)}</b></td>
      <td data-l="Contact"><b>${esc(w.full_name)}</b>${w.company ? ` · ${esc(w.company)}` : ''}<div class="muted small"><a href="tel:${esc(w.phone)}">${esc(w.phone)}</a>${w.email ? ' · ' + esc(w.email) : ''}</div></td>
      <td data-l="Wants">${w.products ? `<b>${esc(w.products)}</b> ` : ''}${w.quantity ? `<span class="muted">(${esc(w.quantity)})</span>` : ''}<div class="muted small" style="white-space:pre-line">${esc(w.message)}</div></td>
      <td><select class="in" data-ws="${w.id}" style="min-height:34px;width:auto">${opts.map((o) => `<option ${o === w.status ? 'selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No wholesale requests yet.</div>';
  $('#wt').addEventListener('change', async (e) => { const s = e.target.closest('[data-ws]'); if (!s) return; await api('/api/admin/wholesale/' + s.dataset.ws, { method: 'PATCH', body: JSON.stringify({ status: s.value }) }); toast('Status saved'); poll(); });
};

/* ---------- messages ---------- */
views.messages = async () => {
  main.innerHTML = head('Info desk messages', 'Questions sent from the contact form on the Info desk page.') + '<div class="card"><div class="tw" id="mt"><div class="empty">Loading…</div></div></div>';
  const list = await api('/api/admin/messages');
  $('#mt').innerHTML = list.length ? `<table class="t"><thead><tr><th>Received</th><th>From</th><th>Message</th><th></th></tr></thead><tbody>
    ${list.map((m) => `<tr class="${m.is_read ? '' : 'unread'}"><td><b>${ago(m.created_at)}</b><div class="muted small">${esc(m.topic)}</div></td>
      <td data-l="From"><b>${esc(m.name)}</b><div class="muted small">${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ''}${m.phone && m.email ? ' · ' : ''}${esc(m.email)}</div></td>
      <td style="white-space:pre-line;max-width:420px">${esc(m.message)}</td>
      <td><button class="b sm" data-read="${m.id}" data-v="${m.is_read ? 0 : 1}">${m.is_read ? 'Mark unread' : 'Mark as done'}</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No messages yet.</div>';
  $('#mt').addEventListener('click', async (e) => { const b = e.target.closest('[data-read]'); if (!b) return; await api('/api/admin/messages/' + b.dataset.read, { method: 'PATCH', body: JSON.stringify({ is_read: b.dataset.v === '1' }) }); poll(); views.messages(); });
};

/* ---------- products ---------- */
views.products = async () => {
  main.innerHTML = head('Products', 'Sample products were added on first run. Edit them, upload your own photos, or delete them.', '<button class="b primary" id="newP">Add product</button>') + '<div class="pgrid" id="pg"><div class="empty">Loading…</div></div>';
  const list = await api('/api/admin/products');
  $('#pg').innerHTML = list.length ? list.map((p) => `<div class="card pc">
    <div class="im"><img class="${imgCls(p.image_url)}" src="${esc(p.image_url)}" alt=""><div class="tags">${p.active ? '' : '<span>Hidden</span>'}${p.featured ? '<span>Popular</span>' : ''}${p.is_new ? '<span>New</span>' : ''}</div></div>
    <div class="bd"><b>${esc(p.name)}</b><span class="muted small">${esc(p.category)}${p.color_name ? ' · ' + esc(p.color_name) : ''}</span>
      <div class="row"><span class="num">${p.sale_price ? `<s>${tk(p.price)}</s> <b style="color:var(--ink)">${tk(p.sale_price)}</b>` : `<b style="color:var(--ink)">${tk(p.price)}</b>`}</span><span class="num ${p.stock === 0 ? 'stock-out' : p.stock <= 5 ? 'stock-low' : ''}">${p.stock === 0 ? 'Sold out' : p.stock + ' in stock'}</span></div>
      <div class="acts"><button class="b sm" data-edit="${p.id}">Edit</button><a class="b sm" href="/product?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">View</a></div></div></div>`).join('') : '<div class="empty">No products. Add your first one.</div>';
  $('#newP').addEventListener('click', () => productForm(null));
  $('#pg').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) productForm(list.find((p) => p.id === Number(b.dataset.edit))); });
};

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400; const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => reject(new Error('That file is not an image we can read.'));
    img.src = url;
  });
}

function productForm(p) {
  const isNew = !p;
  p = p || { name: '', category: '', color_name: '', description: '', price: '', sale_price: '', stock: 10, sizes: 'S,M,L,XL,XXL', image: '', image_url: '/assets/placeholder.svg', featured: 0, is_new: 1, active: 1 };
  const m = modal(isNew ? 'Add product' : 'Edit product', `
    <form id="pf" style="display:flex;flex-direction:column;gap:14px" novalidate>
      <div class="img-pick"><div class="prev"><img id="pimg" class="${imgCls(p.image_url)}" src="${esc(p.image_url)}" alt=""></div>
        <div style="display:flex;flex-direction:column;gap:8px"><b>Product photo</b><span class="muted small">JPG, PNG or WebP. A 4:5 portrait photo looks best. Large photos are resized automatically.</span>
          <label class="b sm" style="align-self:flex-start">Upload photo<input type="file" id="pfile" accept="image/png,image/jpeg,image/webp" hidden></label>
          <span class="muted small" id="pup"></span></div></div>
      <label class="fld"><span>Product name</span><input class="in" name="name" value="${esc(p.name)}" required></label>
      <div class="g2">
        <label class="fld"><span>Category</span><input class="in" name="category" value="${esc(p.category)}" list="catlist" placeholder="T-Shirts"></label>
        <label class="fld"><span>Colour</span><input class="in" name="color_name" value="${esc(p.color_name)}" placeholder="Night"></label>
      </div>
      <datalist id="catlist"><option>T-Shirts</option><option>Polos</option><option>Shirts</option><option>Hoodies</option><option>Jackets</option><option>Trousers</option></datalist>
      <div class="g3">
        <label class="fld"><span>Regular price (৳)</span><input class="in" name="price" inputmode="numeric" value="${esc(p.price)}"></label>
        <label class="fld"><span>Sale price (৳) <small>optional</small></span><input class="in" name="sale_price" inputmode="numeric" value="${esc(p.sale_price ?? '')}"></label>
        <label class="fld"><span>Stock</span><input class="in" name="stock" inputmode="numeric" value="${esc(p.stock)}"></label>
      </div>
      <label class="fld"><span>Sizes <small>comma separated</small></span><input class="in" name="sizes" value="${esc(p.sizes)}"></label>
      <label class="fld"><span>Description</span><textarea class="in" name="description">${esc(p.description)}</textarea></label>
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        <label class="chk"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}>Show in Popular</label>
        <label class="chk"><input type="checkbox" name="is_new" ${p.is_new ? 'checked' : ''}>Mark as New</label>
        <label class="chk"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}>Visible in store</label>
      </div>
      <div class="msg bad" id="pmsg" hidden></div>
      <div class="actions"><button class="b primary" type="submit">${isNew ? 'Add product' : 'Save changes'}</button>${isNew ? '' : '<button class="b danger" type="button" id="pdel">Delete product</button>'}</div>
    </form>`);
  let image = p.image;
  $('#pfile', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const st = $('#pup', m.el); st.textContent = 'Uploading…';
    try { const data = await resizeImage(f); const r = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ data }) }); image = r.path; const im = $('#pimg', m.el); im.src = r.path; im.className = 'photo'; st.textContent = 'Photo uploaded. Save to apply it.'; }
    catch (err) { st.textContent = err.message; }
  });
  $('#pf', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name'), category: f.get('category'), color_name: f.get('color_name'), price: f.get('price'), sale_price: f.get('sale_price'), stock: f.get('stock'), sizes: f.get('sizes'), description: f.get('description'), image, featured: !!f.get('featured'), is_new: !!f.get('is_new'), active: !!f.get('active') };
    $$('.fld', m.el).forEach((x) => { x.classList.remove('bad'); $('.err', x)?.remove(); });
    try {
      await api(isNew ? '/api/admin/products' : '/api/admin/products/' + p.id, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(body) });
      toast(isNew ? 'Product added' : 'Product saved'); m.close(); views.products();
    } catch (err) {
      for (const [k, v] of Object.entries(err.errors || {})) { const inp = $(`[name="${k}"]`, m.el); const fl = inp?.closest('.fld'); if (fl) { fl.classList.add('bad'); fl.insertAdjacentHTML('beforeend', `<span class="err">${esc(v)}</span>`); } }
      const pm = $('#pmsg', m.el); pm.textContent = err.message; pm.hidden = false;
    }
  });
  let armed = false;
  $('#pdel', m.el)?.addEventListener('click', async (e) => {
    if (!armed) { armed = true; e.target.textContent = 'Click again to delete for good'; return; }
    await api('/api/admin/products/' + p.id, { method: 'DELETE' }); toast('Product deleted'); m.close(); views.products();
  });
}

/* ---------- settings ---------- */
views.settings = async () => {
  const s = await api('/api/admin/settings');
  const f = (k, label, extra = '', hint = '') => `<label class="fld"><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span><input class="in" name="${k}" value="${esc(s[k] ?? '')}" ${extra}></label>`;
  main.innerHTML = head('Settings', 'Store details customers see on the website.') + `
    <div style="display:grid;gap:16px;max-width:820px">
      <form class="card" id="sf" style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <h2 style="font-size:16px">Delivery</h2>
        <div class="g3">${f('delivery_inside', 'Inside Dhaka (৳)', 'inputmode="numeric"')}${f('delivery_outside', 'Outside Dhaka (৳)', 'inputmode="numeric"')}${f('free_delivery_over', 'Free delivery over (৳)', 'inputmode="numeric"', '0 = off')}</div>
        <h2 style="font-size:16px;margin-top:6px">Store info</h2>
        ${f('announcement', 'Top banner text', '', 'leave empty to hide')}
        <div class="g2">${f('contact_phone', 'Contact phone')}${f('contact_email', 'Contact email', 'type="email"')}</div>
        <div class="g2">${f('whatsapp', 'WhatsApp number', 'placeholder="01XXXXXXXXX"', 'shows the chat button')}${f('facebook_url', 'Facebook page link', 'placeholder="https://facebook.com/…"')}</div>
        <h2 style="font-size:16px;margin-top:6px">Mobile payment</h2>
        <div class="g2">${f('bkash_number', 'bKash number', '', 'shown at checkout')}${f('nagad_number', 'Nagad number', '', 'shown at checkout')}</div>
        <div class="msg" id="smsg" hidden></div>
        <div><button class="b primary" type="submit">Save settings</button></div>
      </form>
      <form class="card" id="pwf" style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <h2 style="font-size:16px">Change admin password</h2>
        <div class="g2"><label class="fld"><span>Current password</span><input class="in" type="password" name="current" autocomplete="current-password"></label>
        <label class="fld"><span>New password <small>8+ characters</small></span><input class="in" type="password" name="next" autocomplete="new-password"></label></div>
        <div class="msg" id="pwmsg" hidden></div>
        <div><button class="b" type="submit">Change password</button></div>
      </form>
    </div>`;
  $('#sf').addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('#smsg');
    try { await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); msg.className = 'msg ok'; msg.textContent = 'Saved. The store shows the new details now.'; }
    catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
    msg.hidden = false;
  });
  $('#pwf').addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('#pwmsg');
    try { await api('/api/admin/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); msg.className = 'msg ok'; msg.textContent = 'Password changed. Log in again with the new password.'; msg.hidden = false; setTimeout(showLogin, 1500); }
    catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; msg.hidden = false; }
  });
};

/* ---------- boot ---------- */
api('/api/admin/me').then((r) => (r.loggedIn ? showApp() : showLogin())).catch(showLogin);
})();
