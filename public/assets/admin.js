// The owner inbox: sign in with the business ID and inbox key, then confirm,
// decline or close requests. The key stays in this tab's sessionStorage only.
(() => {
  const $ = (id) => document.getElementById(id);
  const signin = $('signin');
  const inbox = $('inbox');
  const list = $('list');
  const params = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let auth = null;
  let data = null;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const VIA = { call: 'Call', text: 'Text', email: 'Email' };
  const STATUS = { new: 'New', confirmed: 'Confirmed', declined: 'Declined', done: 'Done', cancelled: 'Cancelled' };
  const ACTIONS = {
    new: [['confirmed', 'Confirm', 'btn-accent'], ['declined', 'Decline', 'btn-ghost']],
    confirmed: [['done', 'Mark done', 'btn-ghost'], ['cancelled', 'Cancel', 'btn-ghost']],
    declined: [['new', 'Reopen', 'btn-ghost']],
    cancelled: [['new', 'Reopen', 'btn-ghost']],
    done: [],
  };
  // Enquiries aren't confirmed; they're answered.
  const ENQUIRY_ACTIONS = {
    new: [['done', 'Mark replied', 'btn-accent'], ['declined', 'Dismiss', 'btn-ghost']],
    done: [['new', 'Reopen', 'btn-ghost']],
    declined: [['new', 'Reopen', 'btn-ghost']],
  };
  const ENQUIRY_STATUS = { new: 'New', done: 'Replied', declined: 'Dismissed' };
  const enquiry = (r) => r.kind === 'enquiry';
  const statusLabel = (r) => (enquiry(r) && ENQUIRY_STATUS[r.status]) || STATUS[r.status];
  const actionsFor = (r) => (enquiry(r) ? ENQUIRY_ACTIONS : ACTIONS)[r.status] || [];
  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    phone: icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    text: icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    email: icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  };

  // ---------- formatting ----------
  const at = (d) => new Date(`${d}T12:00:00Z`);
  const fmtDay = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(at(d));
  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const fmtMinutes = (min) => (min >= 60 ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
  const ago = (iso) => {
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const digits = (p) => String(p).replace(/[^\d+]/g, '');

  // ---------- api ----------
  async function api(path, init = {}) {
    const res = await fetch(`/api/sites/${encodeURIComponent(auth.site)}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.key}`, ...(init.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.message || `The server answered ${res.status}.`), { status: res.status });
    return body;
  }

  // ---------- sign in ----------
  function showSignin(message) {
    inbox.hidden = true;
    signin.hidden = false;
    $('signout').hidden = true;
    $('site-id').value = auth?.site || params.get('site') || '';
    $('demo-hint').hidden = $('site-id').value !== 'demo';
    const err = $('signin-error');
    err.hidden = !message;
    err.textContent = message || '';
  }

  async function open(site, key) {
    auth = { site, key };
    try {
      data = await api(`/requests?status=${view()}`);
    } catch (e) {
      auth = { site, key: null };
      try { sessionStorage.removeItem('bw-inbox'); } catch { /* storage blocked */ }
      showSignin(e.status === 401 ? 'That key doesn’t match this business. Check both and try again.'
        : e.status === 404 ? 'There’s no business with that ID.' : e.message);
      return false;
    }
    try { sessionStorage.setItem('bw-inbox', JSON.stringify(auth)); } catch { /* storage blocked */ }
    signin.hidden = true;
    inbox.hidden = false;
    $('signout').hidden = false;
    history.replaceState(null, '', `?site=${encodeURIComponent(site)}`);
    render();
    return true;
  }

  signin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const site = $('site-id').value.trim().toLowerCase();
    const key = $('key').value.trim();
    if (!site || !key) return showSignin('Enter both the business ID and the inbox key.');
    const button = signin.querySelector('button[type="submit"]');
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Opening…';
    const ok = await open(site, key);
    button.removeAttribute('aria-busy');
    button.textContent = 'Open inbox';
    if (ok) $('inbox-title').focus?.();
  });
  $('site-id').addEventListener('input', () => { $('demo-hint').hidden = $('site-id').value.trim() !== 'demo'; });
  $('fill-demo').addEventListener('click', () => {
    $('site-id').value = 'demo';
    $('key').value = 'ridgeline-demo';
    signin.requestSubmit();
  });
  $('signout').addEventListener('click', () => {
    try { sessionStorage.removeItem('bw-inbox'); } catch { /* storage blocked */ }
    auth = { site: auth?.site, key: null };
    $('key').value = '';
    showSignin('');
  });

  // ---------- inbox ----------
  const view = () => (document.querySelector('input[name="view"]:checked')?.value === 'all' ? 'all' : 'open');

  async function reload(message) {
    try {
      data = await api(`/requests?status=${view()}`);
      render();
      if (message) toast(message);
    } catch (e) {
      if (e.status === 401) showSignin('Your key no longer works. Sign in again.');
      else toast(`Couldn’t refresh: ${e.message}`);
    }
  }

  function render() {
    const { site, requests } = data;
    const fresh = requests.filter((r) => r.status === 'new').length;
    $('inbox-title').textContent = site.name;
    $('inbox-title').tabIndex = -1;
    $('inbox-sub').textContent = `${fresh ? `${fresh} new request${fresh > 1 ? 's' : ''} to answer` : 'Nothing new to answer'} · times in ${site.timezone.split('/').pop().replace(/_/g, ' ')} time`;
    if (!requests.length) {
      list.innerHTML = `<p class="empty">${view() === 'all' ? 'No requests yet.' : 'You’re all caught up. New requests will show up here.'}${site.demo ? ' Send one from the <a href="/">demo page</a>.' : ''}</p>`;
      return;
    }
    // Bookings group by their day; enquiries by the day they arrived.
    const groups = new Map();
    for (const r of requests) {
      const key = r.kind === 'booking' ? r.date : 'enquiries';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const order = [...groups.keys()].sort((a, b) => (a === 'enquiries' ? -1 : b === 'enquiries' ? 1 : a.localeCompare(b)));
    list.innerHTML = order.map((key) => `
      <section class="day-group" aria-label="${key === 'enquiries' ? 'Enquiries' : esc(fmtDay(key))}">
        <h2>${key === 'enquiries' ? 'Enquiries' : esc(fmtDay(key))}</h2>
        <ul class="req-list">${groups.get(key).map((r) => card(r, site)).join('')}</ul>
      </section>`).join('');
  }

  function card(r, site) {
    const service = site.services.find((s) => s.id === r.service);
    const contact = [];
    if (r.phone) {
      contact.push(`<a href="tel:${esc(digits(r.phone))}">${ICONS.phone}${esc(r.phone)}</a>`);
      contact.push(`<a href="sms:${esc(digits(r.phone))}">${ICONS.text}Text</a>`);
    }
    if (r.email) contact.push(`<a href="mailto:${esc(r.email)}">${ICONS.email}${esc(r.email)}</a>`);
    const time = r.kind === 'booking'
      ? `<div class="req-time">${fmtTime(r.time)}<small>${fmtMinutes(r.minutes)}</small></div>`
      : '<div class="req-time">Enquiry</div>';
    const title = r.kind === 'booking' ? (service?.name || r.service) : (service ? `About: ${service.name}` : 'General enquiry');
    return `<li class="req" data-id="${esc(r.id)}">
      ${time}
      <div class="req-main">
        <div class="req-title"><span>${esc(r.name)}</span><span class="pill pill-${r.status}">${statusLabel(r)}</span></div>
        <div>${esc(title)} · wants a <strong>${VIA[r.contactVia].toLowerCase()}</strong> back</div>
        <div class="req-contact">${contact.join('')}</div>
        ${r.message ? `<p class="req-msg">${esc(r.message)}</p>` : ''}
        <div class="req-meta">Ref ${esc(r.id)} · received ${esc(ago(r.createdAt))}</div>
      </div>
      <div class="req-actions">${actionsFor(r).map(([to, label, cls]) =>
        `<button type="button" class="btn btn-sm ${cls}" data-to="${to}" aria-label="${label}: ${esc(r.name)}${r.kind === 'booking' ? `, ${fmtTime(r.time)}` : ''}">${label}</button>`).join('')}</div>
    </li>`;
  }

  list.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-to]');
    if (!button) return;
    const item = button.closest('.req');
    const id = item.dataset.id;
    const to = button.dataset.to;
    item.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await api(`/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: to }) });
      const r = data.requests.find((x) => x.id === id);
      const word = r && enquiry(r)
        ? { done: 'Marked replied', declined: 'Dismissed', new: 'Reopened' }[to]
        : { confirmed: 'Confirmed', declined: 'Declined', done: 'Marked done', cancelled: 'Cancelled', new: 'Reopened' }[to];
      const next = to === 'confirmed' && r ? ` Now ${r.contactVia === 'email' ? 'email' : r.contactVia === 'text' ? 'text' : 'call'} ${r.name} to let them know.` : '';
      if (!reduce.matches && item.animate && view() === 'open' && !['new', 'confirmed'].includes(to)) {
        await item.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(12px)' }], { duration: 180, fill: 'forwards' }).finished;
      }
      await reload(`${word}.${next}`);
    } catch (err) {
      item.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(err.message);
    }
  });

  document.querySelectorAll('input[name="view"]').forEach((i) => i.addEventListener('change', () => reload()));
  $('refresh').addEventListener('click', () => reload('Up to date.'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth?.key) reload(); });

  $('export').addEventListener('click', async () => {
    try {
      const all = await api('/requests?status=all');
      const cols = ['id', 'status', 'kind', 'service', 'date', 'time', 'minutes', 'name', 'contactVia', 'phone', 'email', 'message', 'createdAt'];
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [cols.join(','), ...all.requests.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
      a.download = `${auth.site}-requests-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast(`Couldn’t export: ${e.message}`);
    }
  });

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    if (!reduce.matches && el.animate) el.animate([{ opacity: 0, transform: 'translate(-50%, 8px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 200, easing: 'ease-out' });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  // ---------- start ----------
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('bw-inbox') || 'null'); } catch { /* storage blocked */ }
  if (saved?.key && (!params.get('site') || params.get('site') === saved.site)) open(saved.site, saved.key);
  else showSignin('');
})();
