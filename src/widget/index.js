// <booking-widget>: the embeddable booking and enquiry form.
//
//   <script src="https://YOUR-WORKER/widget.js" defer></script>
//   <booking-widget site="demo"></booking-widget>
//
// Attributes: site (required), mode="booking|enquiry", display="inline|popup",
// accent="#0f766e", theme="light|dark|auto", background="#f3ede2" (any colour; replaces
// theme, or set --booking-background in CSS), heading="…" ("none" hides it),
// button-label="…" (popup), api="https://…" (defaults to where widget.js came from).
// Any element with data-booking-open (="<site>" to pick one) opens a popup widget.
import css from './styles.js';
import { enter, leave, nudge } from './motion.js';
import { fillFrom, inkOn, paletteFrom, parseHex, textOn } from '../shared/color.js';
import { describeWhen, formatDate, formatMinutes, formatMonth, formatTime, timeZoneLabel } from '../shared/format.js';
import { addDays, weekday, zonedToUtc } from '../shared/time.js';
import { CONTACT_VIA, validateRequest } from '../shared/validate.js';

const DEFAULT_ACCENT = '#0f766e';
const BG = { light: '#ffffff', dark: '#17191e' };
const PALETTE_KEYS = ['--bw-bg', '--bw-surface', '--bw-text', '--bw-muted', '--bw-line', '--bw-control', '--bw-danger', '--bw-danger-bg'];
const STALE_MS = 60000;
const API_DEFAULT = (() => {
  try { return new URL(document.currentScript.src).origin; } catch { return location.origin; }
})();
const CONTACT_PHRASE = { call: 'by phone', text: 'by text', email: 'by email' };
const STEPS = [['service', 'Service'], ['time', 'Time'], ['details', 'Details']];
const FIELDS = ['service', 'name', 'contactVia', 'phone', 'email', 'message'];
const WEEKDAYS = [['Su', 'Sunday'], ['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday']];

const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
const ICON = {
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  check: svg('<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>', ' class="bw-done-icon" stroke-width="1.75"'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
const mix = (rgb, target, t) => `rgb(${rgb.map((v, i) => Math.round(v + (target[i] - v) * t)).join(' ')})`;

class BookingWidget extends HTMLElement {
  static get observedAttributes() {
    return ['accent', 'theme', 'background', 'mode', 'display', 'heading', 'button-label'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.s = {
      config: null, error: null, step: null, modeOverride: null,
      service: null, date: null, time: null, month: null, focusDate: null,
      avail: null, availFor: null, availAt: 0, availLoading: false, availError: null, availToken: 0,
      form: { service: '', name: '', contactVia: '', phone: '', email: '', message: '' },
      shownAt: 0, sending: false, result: null,
    };
  }

  // ---------- attributes ----------

  get api() { return (this.getAttribute('api') || API_DEFAULT).replace(/\/+$/, ''); }
  get siteId() { return this.getAttribute('site') || ''; }
  get mode() { return this.s.modeOverride || this.getAttribute('mode') || this.s.config?.mode || 'booking'; }
  get display() { return this.getAttribute('display') === 'popup' ? 'popup' : 'inline'; }
  get theme() {
    const t = this.getAttribute('theme');
    if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return t === 'dark' ? 'dark' : 'light';
  }
  get booking() { return this.mode === 'booking'; }

  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.root.innerHTML = `<style>${css}</style><div part="root"></div>`;
    this.shell = this.root.lastElementChild;
    for (const type of ['click', 'change', 'input', 'focusout', 'submit', 'keydown']) {
      this.root.addEventListener(type, (e) => this[`on${type}`](e));
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.paint());
    this.buildShell();
    this.load();
  }

  attributeChangedCallback(name, before, after) {
    if (!this.ready || before === after) return;
    if (name === 'display') this.buildShell();
    if (name === 'mode') {
      this.s.modeOverride = null;
      this.resetFlow();
    }
    this.paint();
    this.renderCard();
    if (name === 'button-label' || name === 'mode') this.labelLauncher();
  }

  // ---------- public API ----------

  open() {
    if (!this.dialog || this.dialog.open) return;
    this.dialog.showModal();
    enter(this.dialog, { y: 16, scale: 0.98, duration: 260 });
    if (this.dialog.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, pseudoElement: '::backdrop' });
    }
  }

  async close() {
    if (!this.dialog?.open) return;
    const anim = await leave(this.dialog, { y: 8, scale: 0.98 });
    this.dialog.close();
    anim?.cancel?.();
  }

  // ---------- setup ----------

  buildShell() {
    if (this.display === 'popup') {
      this.shell.innerHTML = `
        <button type="button" class="bw-btn bw-primary bw-launch" part="button" data-act="open"></button>
        <dialog class="bw-dialog" aria-labelledby="bw-title"><div class="bw" part="card"></div></dialog>`;
      this.dialog = this.shell.querySelector('dialog');
      this.dialog.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    } else {
      this.shell.innerHTML = '<div class="bw" part="card"></div>';
      this.dialog = null;
    }
    this.card = this.shell.querySelector('.bw');
    this.labelLauncher();
    this.paint();
  }

  labelLauncher() {
    const btn = this.shell.querySelector('.bw-launch');
    if (btn) btn.textContent = this.getAttribute('button-label') || (this.booking ? 'Book an appointment' : 'Send an enquiry');
  }

  /**
   * Theme and accent tokens; the accent is adjusted until it passes contrast.
   * A background colour replaces the light or dark theme with a palette
   * worked out from it (paletteFrom), on the base theme its text needs.
   */
  paint() {
    const css = getComputedStyle(this);
    let accent = this.getAttribute('accent') || css.getPropertyValue('--booking-accent').trim();
    if (!parseHex(accent)) accent = DEFAULT_ACCENT;
    const custom = paletteFrom(this.getAttribute('background') || css.getPropertyValue('--booking-background').trim());
    const theme = custom ? custom.theme : this.theme;
    const fill = fillFrom(accent);
    const onFill = textOn(fill);
    const rgb = parseHex(fill);
    const tokens = {
      '--bw-fill': fill,
      '--bw-on-fill': onFill,
      // Hover moves away from the text colour, so contrast only improves.
      '--bw-fill-hover': mix(rgb, onFill === '#ffffff' ? [0, 0, 0] : [255, 255, 255], 0.12),
      // On a custom palette the surface is the harder of the two backgrounds to pass.
      '--bw-ink': inkOn(accent, custom ? custom.tokens['--bw-surface'] : BG[theme]),
      '--bw-tint': `rgb(${rgb.join(' ')} / ${theme === 'dark' ? 0.16 : 0.07})`,
    };
    for (const el of this.shell.querySelectorAll('.bw, .bw-launch, .bw-dialog')) {
      el.dataset.theme = theme;
      for (const [k, v] of Object.entries(tokens)) el.style.setProperty(k, v);
      for (const k of PALETTE_KEYS) {
        if (custom) el.style.setProperty(k, custom.tokens[k]);
        else el.style.removeProperty(k);
      }
    }
  }

  async load() {
    const s = this.s;
    s.error = null;
    s.config = null;
    this.renderCard();
    try {
      if (!this.siteId) throw new Error('The widget needs a site="…" attribute.');
      s.config = await this.getJSON(`/api/sites/${encodeURIComponent(this.siteId)}`);
      this.resetFlow();
    } catch (err) {
      s.error = err.message;
    }
    this.labelLauncher();
    this.renderCard();
  }

  resetFlow() {
    const s = this.s;
    s.step = this.booking ? 'service' : 'details';
    s.service = null;
    s.date = null;
    s.time = null;
    s.focusDate = null;
    s.result = null;
    s.shownAt = 0;
    s.form.message = '';
    s.form.service = '';
  }

  async getJSON(path, init) {
    const res = await fetch(`${this.api}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `The booking system answered ${res.status}.`), { status: res.status, data });
    return data;
  }

  // ---------- rendering ----------

  renderCard({ animate = false, focus = false } = {}) {
    const s = this.s;
    if (!this.card) return;
    let body;
    if (s.error) body = this.errorHTML();
    else if (!s.config) body = '<div class="bw-loading" role="status">Loading…</div>';
    else body = { service: this.serviceHTML, time: this.timeHTML, details: this.detailsHTML, done: this.doneHTML }[s.step].call(this);

    const note = s.config?.demo ? '<p class="bw-note">Demo business: requests are cleared every day.</p>' : '';
    this.card.innerHTML = `${this.headHTML()}<div class="bw-body">${body}</div>${note}`;

    if (s.step === 'details' && s.config && !s.shownAt) s.shownAt = Date.now();
    if (s.step === 'details') this.syncContact();
    if (animate) enter(this.card.querySelector('.bw-body'));
    if (focus) this.card.querySelector('.bw-body .bw-h')?.focus();
    if (s.step === 'time' && s.config) this.ensureAvailability();
  }

  headHTML() {
    const s = this.s;
    const attr = this.getAttribute('heading');
    const title = attr && attr !== 'none' ? attr : (this.booking ? 'Book an appointment' : 'Send an enquiry');
    const hideTitle = attr === 'none' && this.display === 'inline';
    const close = this.display === 'popup'
      ? `<button type="button" class="bw-icon-btn" data-act="close" aria-label="Close">${ICON.close}</button>` : '';
    let steps = '';
    if (s.config && this.booking && s.step !== 'done' && !s.error) {
      const current = STEPS.findIndex(([key]) => key === s.step);
      steps = `<ol class="bw-steps" aria-label="Booking steps">${STEPS.map(([key, label], i) => {
        if (i < current) return `<li class="is-done"><button type="button" data-act="goto" data-step="${key}">${label}<span class="bw-visually-hidden"> (done, change)</span></button></li>`;
        if (i === current) return `<li class="is-current" aria-current="step">${label}</li>`;
        return `<li>${label}</li>`;
      }).join('')}</ol>`;
    }
    return `<header class="bw-head">
      <div class="bw-head-row">
        <div><h2 class="bw-title${hideTitle ? ' bw-visually-hidden' : ''}" id="bw-title">${esc(title)}</h2>${s.config ? `<p class="bw-biz">${esc(s.config.name)}</p>` : ''}</div>
        ${close}
      </div>${steps}</header>`;
  }

  errorHTML() {
    return `<div class="bw-alert" role="alert">${ICON.alert}<span>Online booking isn’t available right now. ${esc(this.s.error)}</span></div>
      <div class="bw-actions"><button type="button" class="bw-btn bw-ghost" data-act="retry">Try again</button></div>`;
  }

  serviceHTML() {
    const { config, service } = this.s;
    return `<h3 class="bw-h" tabindex="-1">Choose a service</h3>
      <fieldset class="bw-group" aria-describedby="err-service">
        <legend class="bw-visually-hidden">Service</legend>
        <div class="bw-options">${config.services.map((sv) => `
          <label class="bw-option">
            <input type="radio" name="service" value="${esc(sv.id)}"${sv.id === service ? ' checked' : ''}>
            <span><span class="bw-opt-name">${esc(sv.name)}</span>${sv.description ? `<span class="bw-opt-desc">${esc(sv.description)}</span>` : ''}</span>
            <span class="bw-opt-meta">${sv.price ? `<strong>${esc(sv.price)}</strong>` : ''}${formatMinutes(sv.minutes)}</span>
          </label>`).join('')}
        </div>
      </fieldset>
      <p class="bw-err" id="err-service" hidden></p>
      <div class="bw-actions"><button type="button" class="bw-btn bw-primary" data-act="to-time">Continue</button></div>`;
  }

  timeHTML() {
    const sv = this.currentService();
    return `<h3 class="bw-h" tabindex="-1">Pick a day and time</h3>
      <p class="bw-sub"><span>${esc(sv.name)} · ${formatMinutes(sv.minutes)}</span>
        <button type="button" class="bw-link" data-act="goto" data-step="service">Change service</button></p>
      <div class="bw-when" data-when>${this.whenHTML()}</div>
      <p class="bw-err" id="err-time" hidden></p>
      <div class="bw-actions"><button type="button" class="bw-btn bw-primary" data-act="to-details">Continue</button></div>`;
  }

  whenHTML() {
    const s = this.s;
    if (s.availError) {
      return `<div class="bw-alert" role="alert">${ICON.alert}<span>We couldn’t load the open times. ${esc(s.availError)}</span></div>
        <div><button type="button" class="bw-btn bw-ghost" data-act="reload-avail">Try again</button></div>`;
    }
    if (!s.avail || s.availFor !== s.service) {
      return '<p class="bw-empty" role="status" style="min-height:300px">Finding open times…</p>';
    }
    if (!Object.values(s.avail.dates).some((t) => t.length)) {
      const phone = s.config.phone ? ` or call <a class="bw-phone" href="${telHref(s.config.phone)}">${esc(s.config.phone)}</a>` : '';
      return `<div class="bw-empty"><p style="margin:0 0 12px">There are no open times for this service in the next ${s.config.daysAhead} days. Send us a message${phone} and we’ll find a time.</p>
        <button type="button" class="bw-btn bw-ghost" data-act="to-enquiry">Send a message instead</button></div>`;
    }
    return `${this.calendarHTML()}${this.timesHTML()}`;
  }

  calendarHTML() {
    const s = this.s;
    const { first, last, dates } = s.avail;
    const [y, m] = s.month.split('-').map(Number);
    const firstOfMonth = `${s.month}-01`;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const focus = this.focusDateInMonth();
    const cells = Array(weekday(firstOfMonth)).fill('<td></td>');
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${s.month}-${String(d).padStart(2, '0')}`;
      const count = (dates[date] || []).length;
      const today = date === first;
      const label = `${formatDate(date)}${today ? ', today' : ''}, ${count ? `${count} time${count > 1 ? 's' : ''} open` : 'no open times'}`;
      cells.push(`<td><button type="button" class="bw-day${today ? ' is-today' : ''}" data-act="day" data-date="${date}"
        tabindex="${date === focus ? 0 : -1}" aria-pressed="${date === s.date}"${count ? '' : ' aria-disabled="true"'} aria-label="${esc(label)}">${d}</button></td>`);
    }
    while (cells.length % 7) cells.push('<td></td>');
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);

    const atStart = s.month <= first.slice(0, 7);
    const atEnd = s.month >= last.slice(0, 7);
    return `<div class="bw-cal">
      <div class="bw-cal-head">
        <button type="button" class="bw-icon-btn" data-act="prev-month" aria-label="Previous month"${atStart ? ' aria-disabled="true"' : ''}>${ICON.prev}</button>
        <h4 class="bw-month" id="bw-month" aria-live="polite">${formatMonth(s.month)}</h4>
        <button type="button" class="bw-icon-btn" data-act="next-month" aria-label="Next month"${atEnd ? ' aria-disabled="true"' : ''}>${ICON.next}</button>
      </div>
      <table class="bw-grid" aria-labelledby="bw-month">
        <thead><tr>${WEEKDAYS.map(([short, long]) => `<th scope="col"><abbr title="${long}" style="text-decoration:none">${short}</abbr></th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
  }

  timesHTML() {
    const s = this.s;
    if (!s.date) return '<div class="bw-times"><p class="bw-empty">Choose a day to see its open times.</p></div>';
    const times = s.avail.dates[s.date] || [];
    const groups = [['Morning', (t) => t < '12:00'], ['Afternoon', (t) => t >= '12:00' && t < '17:00'], ['Evening', (t) => t >= '17:00']]
      .map(([label, test]) => [label, times.filter(test)]).filter(([, list]) => list.length);
    const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tz = visitorTz !== s.config.timezone
      ? `<p class="bw-tz">Times are in ${esc(timeZoneLabel(s.config.timezone))}, where ${esc(s.config.name)} is.</p>` : '';
    return `<div class="bw-times" data-times>
      <h4 class="bw-times-h" id="bw-times-h">${formatDate(s.date)}</h4>${tz}
      <div role="radiogroup" aria-labelledby="bw-times-h" aria-describedby="err-time">
        ${groups.map(([label, list]) => `<div class="bw-period"><p class="bw-period-h" aria-hidden="true">${label}</p><div class="bw-chips">${
          list.map((t) => `<label class="bw-chip"><input type="radio" name="time" value="${t}"${t === s.time ? ' checked' : ''}>${formatTime(t)}</label>`).join('')
        }</div></div>`).join('')}
      </div></div>`;
  }

  detailsHTML() {
    const { config, form, service, date, time } = this.s;
    const booking = this.booking;
    const sv = this.currentService();
    const summary = booking ? `<div class="bw-summary">
        <div><strong>${esc(sv.name)}</strong> <span>· ${formatMinutes(sv.minutes)}${sv.price ? ` · ${esc(sv.price)}` : ''}</span><br>${esc(describeWhen({ date, time }))}</div>
        <button type="button" class="bw-link" data-act="goto" data-step="time">Change</button></div>` : '';
    const serviceSelect = booking ? '' : `
      <div class="bw-field">
        <label class="bw-label" for="bw-service">What’s it about? <span class="bw-hint">(optional)</span></label>
        <select class="bw-input" id="bw-service" name="service" aria-describedby="err-service">
          <option value="">Choose…</option>
          ${config.services.map((s) => `<option value="${esc(s.id)}"${s.id === form.service ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        <p class="bw-err" id="err-service" hidden></p>
      </div>`;
    const radio = (key) => `<label><input type="radio" name="contactVia" value="${key}"${form.contactVia === key ? ' checked' : ''}>${{ call: 'Call', text: 'Text', email: 'Email' }[key]}</label>`;
    return `<h3 class="bw-h" tabindex="-1">${booking ? 'Your details' : 'Tell us what you need'}</h3>
      ${summary}
      <form class="bw-form" novalidate>
        ${serviceSelect}
        <div class="bw-field">
          <label class="bw-label" for="bw-name">Name</label>
          <input class="bw-input" id="bw-name" name="name" autocomplete="name" required aria-describedby="err-name" value="${esc(form.name)}">
          <p class="bw-err" id="err-name" hidden></p>
        </div>
        <fieldset class="bw-field" aria-describedby="err-contactVia">
          <legend class="bw-label">How should we reach you?</legend>
          <div class="bw-seg">${radio('call')}${radio('text')}${radio('email')}</div>
          <p class="bw-err" id="err-contactVia" hidden></p>
        </fieldset>
        <div class="bw-row2">
          <div class="bw-field">
            <label class="bw-label" for="bw-phone">Phone <span class="bw-hint" data-hint="phone"></span></label>
            <input class="bw-input" id="bw-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" pattern="[0-9()+.\\- ]{7,30}" aria-describedby="err-phone" value="${esc(form.phone)}">
            <p class="bw-err" id="err-phone" hidden></p>
          </div>
          <div class="bw-field">
            <label class="bw-label" for="bw-email">Email <span class="bw-hint" data-hint="email"></span></label>
            <input class="bw-input" id="bw-email" name="email" type="email" autocomplete="email" spellcheck="false" aria-describedby="err-email" value="${esc(form.email)}">
            <p class="bw-err" id="err-email" hidden></p>
          </div>
        </div>
        <div class="bw-field">
          <label class="bw-label" for="bw-message">${booking ? 'Anything we should know? <span class="bw-hint">(optional)</span>' : 'Your message'}</label>
          <textarea class="bw-input" id="bw-message" name="message" rows="3" maxlength="1000" aria-describedby="err-message">${esc(form.message)}</textarea>
          <p class="bw-err" id="err-message" hidden></p>
        </div>
        <div class="bw-hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="bw-alert" id="bw-alert" role="alert" hidden></div>
        <p class="bw-next" id="bw-next"></p>
        <div class="bw-actions" style="margin-top:0">
          <button type="submit" class="bw-btn bw-primary">${booking ? 'Request this time' : 'Send message'}</button>
        </div>
      </form>`;
  }

  doneHTML() {
    const { config, result } = this.s;
    const booking = result.kind === 'booking';
    const sv = config.services.find((s) => s.id === result.service);
    const rows = [['Reference', result.id]];
    if (sv) rows.push(['Service', booking ? `${sv.name} (${formatMinutes(sv.minutes)})` : sv.name]);
    if (booking) rows.push(['When', describeWhen(result)]);
    const phone = config.phone ? ` Need to change it? Call <a class="bw-phone" href="${telHref(config.phone)}">${esc(config.phone)}</a>.` : '';
    return `<div class="bw-done">
      ${ICON.check}
      <h3 class="bw-h" tabindex="-1">${booking ? 'Request sent' : 'Message sent'}</h3>
      <p>${booking
        ? `Your time is held while ${esc(config.name)} confirms it ${CONTACT_PHRASE[result.contactVia] || ''} ${esc(config.replyTime)}.`
        : `${esc(config.name)} will reply ${CONTACT_PHRASE[result.contactVia] || ''} ${esc(config.replyTime)}.`}${phone}</p>
      <dl class="bw-receipt">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="bw-actions">
        ${booking ? `<button type="button" class="bw-btn bw-ghost" data-act="ics">${ICON.calendar}Add to calendar</button>` : ''}
        <button type="button" class="bw-link" data-act="restart">${booking ? 'Book another time' : 'Send another message'}</button>
      </div>
    </div>`;
  }

  // ---------- date & time ----------

  currentService() {
    return this.s.config.services.find((sv) => sv.id === this.s.service) || null;
  }

  focusDateInMonth() {
    const s = this.s;
    const inMonth = (d) => d && d.startsWith(s.month);
    if (inMonth(s.focusDate)) return s.focusDate;
    if (inMonth(s.date)) return s.date;
    const open = Object.keys(s.avail.dates).find((d) => inMonth(d) && s.avail.dates[d].length);
    return open || (inMonth(s.avail.first) ? s.avail.first : `${s.month}-01`);
  }

  async ensureAvailability(force = false) {
    const s = this.s;
    if (!s.service) return;
    if (!force && s.avail && s.availFor === s.service && Date.now() - s.availAt < STALE_MS) return;
    const token = ++s.availToken;
    const service = s.service;
    s.availLoading = true;
    s.availError = null;
    if (s.availFor !== service) s.avail = null;
    this.renderWhen();
    try {
      const data = await this.getJSON(`/api/sites/${encodeURIComponent(this.siteId)}/availability?service=${encodeURIComponent(service)}`);
      if (token !== s.availToken) return;
      s.avail = data;
      s.availFor = service;
      s.availAt = Date.now();
      if (s.date && !(data.dates[s.date] || []).length) s.date = null;
      if (s.time && !(data.dates[s.date] || []).includes(s.time)) s.time = null;
      if (!s.date) s.date = Object.keys(data.dates).find((d) => data.dates[d].length) || null;
      s.month = (s.date || data.first).slice(0, 7);
      s.focusDate = s.date;
    } catch (err) {
      if (token !== s.availToken) return;
      s.availError = err.message;
    }
    s.availLoading = false;
    if (s.step === 'time') this.renderWhen();
  }

  renderWhen({ focusDate, focusAct } = {}) {
    const el = this.card.querySelector('[data-when]');
    if (!el) return;
    el.innerHTML = this.whenHTML();
    if (focusDate) el.querySelector(`[data-date="${focusDate}"]`)?.focus();
    if (focusAct) el.querySelector(`[data-act="${focusAct}"]`)?.focus();
  }

  selectDate(date) {
    const s = this.s;
    if (date !== s.date) s.time = null;
    s.date = date;
    s.focusDate = date;
    this.renderWhen({ focusDate: date });
    this.showError('time', '');
    enter(this.card.querySelector('[data-times]'), { y: 6 });
  }

  shiftMonth(delta) {
    const s = this.s;
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    s.month = d.toISOString().slice(0, 7);
    s.focusDate = null;
  }

  // ---------- form ----------

  payload() {
    const s = this.s;
    const form = this.card.querySelector('form');
    return {
      ...s.form,
      kind: this.mode,
      service: this.booking ? s.service : s.form.service,
      date: s.date,
      time: s.time,
      website: form?.elements.website?.value || '',
      elapsedMs: s.shownAt ? Date.now() - s.shownAt : 0,
    };
  }

  /** Required markers and the "what happens next" line follow the chosen reply route. */
  syncContact() {
    const { config, form } = this.s;
    const via = form.contactVia;
    const needs = { phone: via === 'call' || via === 'text', email: via === 'email' };
    for (const field of ['phone', 'email']) {
      const input = this.card.querySelector(`#bw-${field}`);
      const hint = this.card.querySelector(`[data-hint="${field}"]`);
      if (!input) continue;
      input.required = needs[field];
      hint.textContent = needs[field] ? '' : '(optional)';
    }
    const next = this.card.querySelector('#bw-next');
    if (!next) return;
    const how = via ? ` ${CONTACT_PHRASE[via]}` : '';
    const phone = config.phone ? ` In a hurry? Call <a class="bw-phone" href="${telHref(config.phone)}">${esc(config.phone)}</a>.` : '';
    next.innerHTML = this.booking
      ? `<strong>What happens next:</strong> we hold this time for you while ${esc(config.name)} confirms it${how} ${esc(config.replyTime)}.${phone}`
      : `<strong>What happens next:</strong> ${esc(config.name)} will reply${how} ${esc(config.replyTime)}.${phone}`;
  }

  showError(field, message) {
    const el = this.card.querySelector(`#err-${field}`);
    if (!el) return;
    el.hidden = !message;
    el.innerHTML = message ? `${ICON.alert}<span>${esc(message)}</span>` : '';
    const input = this.card.querySelector(`[name="${field}"]:not([type="radio"])`);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  validateField(field) {
    const { errors } = validateRequest(this.s.config, this.payload());
    this.showError(field, errors[field] || '');
  }

  setAlert(message) {
    const el = this.card.querySelector('#bw-alert');
    if (!el) return;
    el.hidden = !message;
    el.innerHTML = message ? `${ICON.alert}<span>${message}</span>` : '';
  }

  focusFirstError(errors) {
    const first = FIELDS.find((f) => errors[f]);
    if (!first) return;
    const target = first === 'contactVia'
      ? this.card.querySelector('[name="contactVia"]')
      : this.card.querySelector(`[name="${first}"]`);
    target?.focus();
  }

  async submit() {
    const s = this.s;
    if (s.sending) return;
    const body = this.payload();
    const { errors } = validateRequest(s.config, body);
    const shown = FIELDS.filter((f) => f !== 'service' || !this.booking);
    for (const f of shown) this.showError(f, errors[f] || '');
    if (this.booking && (errors.service || errors.time)) return this.go(errors.service ? 'service' : 'time');
    if (shown.some((f) => errors[f])) return this.focusFirstError(errors);

    const button = this.card.querySelector('button[type="submit"]');
    const label = button.textContent;
    s.sending = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Sending…';
    this.setAlert('');
    const phone = s.config.phone ? `, or call ${esc(s.config.phone)}` : '';
    try {
      const data = await this.getJSON(`/api/sites/${encodeURIComponent(this.siteId)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      s.result = { ...data.request, contactVia: body.contactVia };
      s.step = 'done';
      s.availAt = 0;
      this.renderCard({ animate: true, focus: true });
      this.dispatchEvent(new CustomEvent('booking:sent', { detail: s.result, bubbles: true, composed: true }));
    } catch (err) {
      if (err.status === 409) {
        s.time = null;
        s.step = 'time';
        this.renderCard({ animate: true, focus: true });
        this.showError('time', err.message);
        this.ensureAvailability(true);
      } else if (err.status === 422 && err.data?.errors) {
        for (const f of shown) this.showError(f, err.data.errors[f] || '');
        this.focusFirstError(err.data.errors);
      } else {
        this.setAlert(err.status ? esc(err.message) : `We couldn’t reach the booking system. Check your connection and try again${phone}.`);
      }
    } finally {
      s.sending = false;
      if (button.isConnected) {
        button.removeAttribute('aria-busy');
        button.textContent = label;
      }
    }
  }

  go(step) {
    this.s.step = step;
    this.renderCard({ animate: true, focus: true });
  }

  downloadIcs() {
    const { config, result } = this.s;
    const sv = config.services.find((s) => s.id === result.service);
    const start = zonedToUtc(result.date, result.time, config.timezone);
    const end = new Date(start.getTime() + result.minutes * 60000);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = (v) => String(v).replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//booking-widget//EN', 'BEGIN:VEVENT',
      `UID:${result.id}@booking-widget`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${text(`${sv ? sv.name : 'Appointment'} at ${config.name} (requested)`)}`,
      `DESCRIPTION:${text(`Reference ${result.id}. ${config.name} will confirm ${CONTACT_PHRASE[result.contactVia] || ''} ${config.replyTime}.${config.phone ? ` Phone: ${config.phone}` : ''}`)}`,
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/[^\w -]+/g, '').trim() || 'booking'} ${result.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- events ----------

  onclick(e) {
    const s = this.s;
    const t = e.target.closest('[data-act]');
    if (!t) {
      if (e.target === this.dialog) this.close(); // a click on the backdrop
      return;
    }
    const act = t.dataset.act;
    if (t.getAttribute('aria-disabled') === 'true') return;
    switch (act) {
      case 'open': this.open(); break;
      case 'close': this.close(); break;
      case 'retry': this.load(); break;
      case 'goto': this.go(t.dataset.step); break;
      case 'to-time':
        if (!s.service) {
          this.showError('service', 'Choose a service to see its open times.');
          nudge(this.card.querySelector('.bw-options'));
          this.card.querySelector('[name="service"]')?.focus();
        } else this.go('time');
        break;
      case 'to-details':
        if (!s.date || !s.time) {
          this.showError('time', s.date ? 'Choose a time.' : 'Choose a day and time.');
          nudge(this.card.querySelector('[data-times]'));
        } else this.go('details');
        break;
      case 'prev-month':
      case 'next-month': {
        const delta = act === 'next-month' ? 1 : -1;
        this.shiftMonth(delta);
        this.renderWhen({ focusAct: act });
        enter(this.card.querySelector('.bw-grid'), { x: 12 * delta, y: 0, duration: 200 });
        break;
      }
      case 'day': this.selectDate(t.dataset.date); break;
      case 'reload-avail': this.ensureAvailability(true); break;
      case 'to-enquiry':
        s.modeOverride = 'enquiry';
        s.form.service = s.service || '';
        this.go('details');
        break;
      case 'ics': this.downloadIcs(); break;
      case 'restart':
        s.modeOverride = null;
        this.resetFlow();
        this.go(s.step);
        break;
      default:
    }
  }

  onchange(e) {
    const s = this.s;
    const { name, value } = e.target;
    if (name === 'service' && this.booking && s.step === 'service') {
      if (value !== s.service) {
        s.service = value;
        s.date = null;
        s.time = null;
      }
      this.showError('service', '');
    } else if (name === 'time') {
      s.time = value;
      this.showError('time', '');
    } else if (name === 'contactVia') {
      s.form.contactVia = value;
      this.syncContact();
      this.showError('contactVia', '');
      // A different route changes which fields are required; recheck the shown ones.
      for (const f of ['phone', 'email']) if (!this.card.querySelector(`#err-${f}`)?.hidden) this.validateField(f);
    } else if (name === 'service') {
      s.form.service = value;
    }
  }

  oninput(e) {
    const { name, value } = e.target;
    if (!(name in this.s.form) || e.target.type === 'radio') return;
    this.s.form[name] = value;
    // Clear an error as soon as the field becomes valid; don't add new ones mid-typing.
    const err = this.card.querySelector(`#err-${name}`);
    if (err && !err.hidden) this.validateField(name);
  }

  onfocusout(e) {
    const { name, value } = e.target;
    if (!['name', 'phone', 'email', 'message'].includes(name)) return;
    if (value.trim() || e.target.required) this.validateField(name);
  }

  onsubmit(e) {
    e.preventDefault();
    this.submit();
  }

  onkeydown(e) {
    const day = e.target.closest?.('.bw-day');
    if (!day) return;
    const s = this.s;
    const cur = day.dataset.date;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next;
    if (e.key in moves) next = addDays(cur, moves[e.key]);
    else if (e.key === 'Home') next = addDays(cur, -weekday(cur));
    else if (e.key === 'End') next = addDays(cur, 6 - weekday(cur));
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = addDays(cur, e.key === 'PageUp' ? -28 : 28);
    else return;
    e.preventDefault();
    if (next < s.avail.first) next = s.avail.first;
    if (next > s.avail.last) next = s.avail.last;
    s.focusDate = next;
    s.month = next.slice(0, 7);
    this.renderWhen({ focusDate: next });
  }
}

if (!customElements.get('booking-widget')) {
  customElements.define('booking-widget', BookingWidget);

  // <a data-booking-open> (or ="<site>") anywhere on the page opens a popup widget.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest?.('[data-booking-open]');
    if (!trigger) return;
    const site = trigger.getAttribute('data-booking-open');
    const widget = document.querySelector(`booking-widget[display="popup"]${site ? `[site="${CSS.escape(site)}"]` : ''}`);
    if (!widget) return;
    e.preventDefault();
    widget.open();
  });
}
