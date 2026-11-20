/* ANSORION invoices: three invoices per A4 sheet, downloadable as a PDF or printable. */
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = (n) => '৳' + Number(n || 0).toLocaleString('en-IN');
const date = (s) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const PER_PAGE = 3;
const MAX_ROWS = 4; // item rows that fit on one invoice; the rest are summed up in one line

function fail(text, link) {
  $('#info').textContent = '';
  const m = $('#msg'); m.hidden = false;
  m.innerHTML = `<p>${esc(text)}</p>${link || ''}`;
}

// The PDF maker can't draw an SVG that has no fixed size, so the logo is turned into a sharp PNG first.
let LOGO = '/assets/logo.svg';
async function prepareLogo() {
  try {
    let svg = await (await fetch('/assets/logo.svg', { cache: 'no-cache' })).text();
    const vb = /viewBox="([\d.\s-]+)"/.exec(svg)[1].trim().split(/\s+/).map(Number);
    const w = 900, h = Math.round(w * vb[3] / vb[2]); // 900 px wide: sharp at print size
    svg = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    LOGO = c.toDataURL('image/png');
  } catch (e) { console.warn('Logo could not be prepared for the PDF:', e); }
}

function slip(o, store) {
  const items = o.items || [];
  const shown = items.length > MAX_ROWS ? items.slice(0, MAX_ROWS - 1) : items;
  const rest = items.slice(shown.length);
  const cod = /cash/i.test(o.payment_method);
  const contact = [store.phone, store.email].filter(Boolean).map(esc).join(' · ');
  return `<section class="slip${items.length > 3 ? ' tight' : ''}">
    <div class="top">
      <div class="brand"><img src="${LOGO}" alt="ANSORION" width="87" height="40"><small>Essentials, aligned.<br>ansorion.vercel.app${contact ? '<br>' + contact : ''}</small></div>
      <div class="inv"><h2>INVOICE</h2><div class="no">${esc(o.order_no)}</div><div class="dt">${date(o.created_at)}</div></div>
    </div>
    <div class="mid">
      <div class="cust"><div class="lbl">Deliver to</div>
        <b>${esc(o.customer_name)}</b><div>${esc(o.phone)}</div>
        <div class="addr">${esc(o.address)}, ${esc(o.city)}</div></div>
      <div class="pay"><div class="lbl">Payment</div>
        <div><b>${esc(o.payment_method)}</b>${o.payment_ref ? ` · TrxID ${esc(o.payment_ref)}` : ''}</div>
        <div>Area: ${o.zone === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka'}</div>
        ${o.note ? `<div class="addr">Note: ${esc(o.note)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th>Item</th><th class="c">Size</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>
      ${shown.map((i) => `<tr><td class="nm">${esc(i.name)}</td><td class="c">${esc(i.size)}</td><td class="c">${i.qty}</td><td class="r">${tk(i.unit_price)}</td><td class="r">${tk(i.line_total)}</td></tr>`).join('')}
      ${rest.length ? `<tr class="more"><td>+ ${rest.length} more item${rest.length > 1 ? 's' : ''}</td><td></td><td class="c">${rest.reduce((a, i) => a + i.qty, 0)}</td><td></td><td class="r">${tk(rest.reduce((a, i) => a + i.line_total, 0))}</td></tr>` : ''}
    </tbody></table>
    <div class="bottom">
      <div class="note"><b>Thank you for shopping with ANSORION.</b><br>Check your parcel in front of the rider. Wrong size? Exchange within 3 days of delivery.</div>
      <div class="tot">
        <div><span>Subtotal (${items.reduce((a, i) => a + i.qty, 0)} pcs)</span><span>${tk(o.subtotal)}</span></div>
        <div><span>Delivery</span><span>${o.delivery_charge ? tk(o.delivery_charge) : 'Free'}</span></div>
        ${cod ? `<div class="collect"><span>Total · collect on delivery</span><span>${tk(o.total)}</span></div>`
          : `<div class="collect paid"><span>Total · paid by ${esc(o.payment_method)}</span><span>${tk(o.total)}</span></div>`}
      </div>
    </div>
  </section>`;
}

async function main() {
  const ids = new URLSearchParams(location.search).get('ids') || '';
  if (!ids) return fail('No orders chosen. Go back to Orders, tick the orders you want, then click Invoices.', '<a href="/admin#orders">Back to orders</a>');
  const res = await fetch('/api/admin/invoices?ids=' + encodeURIComponent(ids), { credentials: 'same-origin' });
  if (res.status === 401) return fail('Please log in to the admin panel first.', '<a href="/admin">Open admin login</a>');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail(data.error || 'Could not load the orders.');
  const { orders, store } = data;
  await prepareLogo();
  if (!orders.length) return fail('Those orders were not found. They may have been deleted.');

  const sheets = [];
  for (let i = 0; i < orders.length; i += PER_PAGE) {
    const group = orders.slice(i, i + PER_PAGE);
    while (group.length < PER_PAGE) group.push(null);
    sheets.push(`<div class="sheet">${group.map((o) => (o ? slip(o, store) : '<section class="slip blank"></section>')).join('')}</div>`);
  }
  $('#pages').innerHTML = sheets.join('');
  $('#info').textContent = `${orders.length} order${orders.length > 1 ? 's' : ''} · ${sheets.length} A4 page${sheets.length > 1 ? 's' : ''} (3 invoices per page)`;
  document.title = `Invoices (${orders.length}) | ANSORION Admin`;

  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  $('#printBtn').disabled = false; $('#pdfBtn').disabled = false;
  $('#printBtn').addEventListener('click', () => window.print());
  $('#pdfBtn').addEventListener('click', () => makePdf(orders));
}

async function makePdf(orders) {
  const btn = $('#pdfBtn'); const label = btn.textContent;
  if (!window.jspdf || !window.html2canvas) { alert('The PDF tool could not load. Check your internet connection, or use Print and choose "Save as PDF".'); return; }
  btn.disabled = true;
  try {
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = [...document.querySelectorAll('.sheet')];
    for (let i = 0; i < pages.length; i++) {
      btn.textContent = `Making PDF… ${i + 1}/${pages.length}`;
      const canvas = await window.html2canvas(pages[i], { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    const name = orders.length === 1 ? `invoice-${orders[0].order_no}.pdf` : `ansorion-invoices-${new Date().toISOString().slice(0, 10)}-${orders.length}.pdf`;
    pdf.save(name);
  } catch (e) {
    console.error(e); alert('Could not make the PDF. Use Print and choose "Save as PDF" instead.');
  } finally { btn.disabled = false; btn.textContent = label; }
}

main().catch((e) => { console.error(e); fail('Could not load the invoices. Check your connection and refresh.'); });
})();
