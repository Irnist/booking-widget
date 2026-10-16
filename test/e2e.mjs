// End-to-end checks against a running `npm run dev` (http://127.0.0.1:8787):
//   1. API: double booking, overlaps, spam, rate limit, owner auth, slot release, demo clean-up
//   2. Browser (Chrome): a full booking at 390px and 1440px, validation, enquiry mode,
//      popup, dark theme, calendar keyboard use, the owner inbox, axe and overflow checks
// Usage: node test/e2e.mjs [--base http://127.0.0.1:8787] [--out <screenshot dir>]
// It empties the LOCAL database first; never point it at a deployed Worker.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Launcher } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';

process.stdout.reconfigure?.({ encoding: 'utf8', errors: 'replace' });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:8787');
const OUT = resolve(root, arg('out', 'test/out'));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE)) throw new Error('e2e only runs against a local dev server');
mkdirSync(OUT, { recursive: true });

const KEY = 'ridgeline-demo';
let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra && !cond ? `\n      ${extra}` : ''}`);
  if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(command) {
  const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
  const res = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--local', '--command', command], {
    cwd: root, encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`wrangler d1 execute failed: ${res.stderr || res.stdout}`);
}

async function call(path, { method = 'GET', body, ip = '203.0.113.1', key, origin } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const person = { name: 'Test Person', contactVia: 'text', phone: '(555) 010-0199', elapsedMs: 5000 };
const book = (service, date, time, ip, extra = {}) =>
  call('/api/sites/demo/requests', { method: 'POST', ip, body: { kind: 'booking', service, date, time, ...person, ...extra } });

// ---------------------------------------------------------------- API
async function apiChecks() {
  console.log('\n== API ==');
  const avail = (await call('/api/sites/demo/availability?service=skin-fade')).body;
  const days = Object.entries(avail.dates).filter(([, t]) => t.length >= 8);
  ok(days.length > 5, 'availability lists open days');
  const [date, times] = days[1];
  const start = times.find((t) => t >= '10:00');

  const race = await Promise.all([book('skin-fade', date, start, '198.51.100.1'), book('skin-fade', date, start, '198.51.100.2')]);
  const codes = race.map((r) => r.status).sort();
  ok(codes[0] === 201 && codes[1] === 409, 'two requests for one slot at once: one saves, one gets 409', JSON.stringify(codes));

  // skin-fade is 45 min in 15-min slots: start, +15, +30 are held.
  const plus30 = (t, m) => { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const overlap = await book('classic-cut', date, plus30(start, 30), '198.51.100.3');
  ok(overlap.status === 409, 'a booking overlapping a longer one is refused');
  const after = await book('classic-cut', date, plus30(start, 45), '198.51.100.3');
  ok(after.status === 201, 'the slot right after it is still bookable', JSON.stringify(after.body));
  const fresh = (await call('/api/sites/demo/availability?service=classic-cut')).body.dates[date];
  ok(!fresh.includes(start) && !fresh.includes(plus30(start, 15)), 'availability hides held slots');

  const fast = await book('classic-cut', date, times.at(-1), '198.51.100.4', { elapsedMs: 200 });
  ok(fast.status === 422 && fast.body.error === 'too_fast', 'an instant submission is asked to send again');
  const honeypot = await book('classic-cut', date, times.at(-1), '198.51.100.4', { website: 'http://spam.example' });
  ok(honeypot.status === 201, 'a filled honeypot looks like success to the bot');
  const invalid = await book('classic-cut', date, times.at(-1), '198.51.100.4', { contactVia: 'email', phone: '' });
  ok(invalid.status === 422 && invalid.body.errors?.email, 'choosing email without an address is an error');
  const closed = await book('classic-cut', '2026-12-25', '10:00', '198.51.100.4');
  ok(closed.status === 409 || closed.status === 422, 'closed days cannot be booked');

  const ip = '198.51.100.9';
  const enquiry = { kind: 'enquiry', name: 'Rate Test', contactVia: 'email', email: 'r@example.com', message: 'Do you do walk-ins?', elapsedMs: 5000 };
  const limited = [];
  for (let i = 0; i < 6; i++) limited.push((await call('/api/sites/demo/requests', { method: 'POST', ip, body: enquiry })).status);
  ok(limited.slice(0, 5).every((s) => s === 201) && limited[5] === 429, 'the sixth request in an hour from one visitor is refused', limited.join(','));

  ok((await call('/api/sites/demo/requests')).status === 401, 'the inbox needs a key');
  ok((await call('/api/sites/demo/requests', { key: 'wrong' })).status === 401, 'a wrong key is refused');
  const list = await call('/api/sites/demo/requests', { key: KEY });
  ok(list.status === 200 && list.body.requests.length === 7, 'the inbox lists the saved requests (not the honeypot)', `got ${list.body.requests?.length}`);

  const saved = list.body.requests.find((r) => r.date === date && r.time === start);
  const declined = await call(`/api/sites/demo/requests/${saved.id}`, { method: 'PATCH', key: KEY, body: { status: 'declined' } });
  ok(declined.status === 200, 'the owner can decline a request');
  const reopened = (await call('/api/sites/demo/availability?service=classic-cut')).body.dates[date];
  ok(reopened.includes(start), 'declining frees the slot');
  const taker = await book('classic-cut', date, start, '198.51.100.5');
  ok(taker.status === 201, 'someone else can then book it');
  const back = await call(`/api/sites/demo/requests/${saved.id}`, { method: 'PATCH', key: KEY, body: { status: 'new' } });
  ok(back.status === 409, 'reopening the declined booking is refused once its slot is taken');
  const bad = await call(`/api/sites/demo/requests/${saved.id}`, { method: 'PATCH', key: KEY, body: { status: 'lost' } });
  ok(bad.status === 400, 'unknown statuses are refused');

  const blocked = await call('/api/sites/nope');
  ok(blocked.status === 404, 'unknown sites return 404');
  const page404 = await fetch(`${BASE}/no-such-page`);
  ok(page404.status === 404 && /text\/html/.test(page404.headers.get('content-type')), 'unknown pages show the HTML 404 page');
  const widgetCache = (await fetch(`${BASE}/widget.js`)).headers.get('cache-control') || '';
  ok(/must-revalidate/.test(widgetCache) && !/stale-while-revalidate/.test(widgetCache), 'browsers check for a new widget.js on every load', widgetCache);

  // The daily job clears demo requests older than a day.
  sql("INSERT INTO requests (id, site, kind, name, contact_via, email, message, status, created_at) VALUES ('OLD-OLD', 'demo', 'enquiry', 'Old', 'email', 'o@example.com', 'old one', 'new', '2020-01-01T00:00:00Z')");
  await fetch(`${BASE}/__scheduled?cron=17+3+*+*+*`);
  const afterCron = await call('/api/sites/demo/requests?status=all', { key: KEY });
  ok(!afterCron.body.requests.some((r) => r.id === 'OLD-OLD'), 'the daily job empties old demo requests');
}

// ---------------------------------------------------------------- browser
const axeSource = readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

async function audit(page, label) {
  // Measure with the web font in place; the fallback is narrower and can hide an overflow.
  const overflow = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.documentElement.scrollWidth - window.innerWidth;
  });
  ok(overflow <= 0, `${label}: no sideways scroll`, `page is ${overflow}px wider than the screen`);
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  const serious = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  ok(!serious.length, `${label}: axe finds no serious issues`,
    serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')} ${v.nodes[0]?.failureSummary?.split('\n')[1] || ''}`).join('\n      '));
}

const W = 'booking-widget >>> ';
async function shot(page, name) {
  await wait(450); // let entrance animations finish
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** Everything carrying the hidden attribute, in the page and in the widget, must really be invisible. */
async function hiddenStaysHidden(page, label) {
  const leaks = await page.evaluate(() => {
    const roots = [document, ...[...document.querySelectorAll('booking-widget')].map((w) => w.shadowRoot)];
    return roots.flatMap((r) => [...r.querySelectorAll('[hidden]')])
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.id || el.className);
  });
  ok(!leaks.length, `${label}: hidden elements stay hidden`, leaks.join(', '));
}

async function bookingFlow(page, width) {
  const tag = `${width}px`;
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.locator(`${W}.bw-option`).wait();
  await audit(page, `${tag} demo page`);
  await shot(page, `${width}-1-services`);

  // Continue without a choice shows an error next to the list.
  await page.locator(`${W}[data-act="to-time"]`).click();
  const serviceError = await page.$eval(`${W}#err-service`, (el) => !el.hidden && el.textContent);
  ok(Boolean(serviceError), `${tag}: Continue with no service explains what's missing`);

  await page.locator(`${W}.bw-option:nth-child(2)`).click();
  await page.locator(`${W}[data-act="to-time"]`).click();
  await page.locator(`${W}.bw-chip`).wait();
  const focused = await page.evaluate(() => document.querySelector('booking-widget').shadowRoot.activeElement?.textContent);
  ok(focused === 'Pick a day and time', `${tag}: focus moves to the new step's heading`, focused);
  await shot(page, `${width}-2-time`);

  // Arrow keys move between days.
  const day = await page.$(`${W}.bw-day[tabindex="0"]`);
  const before = await day.evaluate((el) => el.dataset.date);
  await day.focus();
  await page.keyboard.press('ArrowRight');
  const afterKey = await page.evaluate(() => document.querySelector('booking-widget').shadowRoot.activeElement?.dataset.date);
  ok(afterKey && afterKey > before, `${tag}: ArrowRight moves to the next day`, `${before} -> ${afterKey}`);
  await page.locator(`${W}.bw-day[aria-pressed="true"]`).click();

  await page.locator(`${W}.bw-chip:nth-child(3)`).click();
  await page.locator(`${W}[data-act="to-details"]`).click();
  await page.locator(`${W}#bw-name`).wait();

  // Sending an empty form marks the fields and focuses the first.
  await page.locator(`${W}button[type="submit"]`).click();
  const invalid = await page.$$eval(`${W}.bw-err:not([hidden])`, (els) => els.length);
  const active = await page.evaluate(() => document.querySelector('booking-widget').shadowRoot.activeElement?.id);
  ok(invalid >= 2 && active === 'bw-name', `${tag}: empty form shows errors and focuses Name`, `${invalid} errors, focus on ${active}`);
  await shot(page, `${width}-3-errors`);

  await page.locator(`${W}#bw-name`).fill('Jordan Lee');
  await page.locator(`${W}.bw-seg label:nth-child(2)`).click(); // Text
  const phoneRequired = await page.$eval(`${W}#bw-phone`, (el) => el.required);
  ok(phoneRequired, `${tag}: choosing Text makes the phone required`);
  await page.locator(`${W}#bw-phone`).fill('(555) 010-0177');
  await wait(2600);
  await hiddenStaysHidden(page, `${tag} details step`);
  await audit(page, `${tag} details step`);
  await page.locator(`${W}button[type="submit"]`).click();
  await page.locator(`${W}.bw-done`).wait();
  const ref = await page.$eval(`${W}.bw-receipt dd`, (el) => el.textContent);
  ok(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(ref), `${tag}: a booking is sent and gets a readable reference`, ref);
  await shot(page, `${width}-4-done`);
}

async function variants(page) {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.locator(`${W}.bw-option`).wait();

  // Enquiry mode
  await page.locator('label:has(input[name="mode"][value="enquiry"])').click();
  await page.locator(`${W}#bw-message`).wait();
  await page.locator(`${W}#bw-name`).fill('Sam Rivera');
  await page.locator(`${W}.bw-seg label:nth-child(3)`).click(); // Email
  await page.locator(`${W}#bw-email`).fill('sam@example.com');
  await page.locator(`${W}#bw-message`).fill('Do you take walk-ins on Saturdays?');
  await wait(2600);
  await page.locator(`${W}button[type="submit"]`).click();
  await page.locator(`${W}.bw-done`).wait();
  ok(true, 'enquiry mode sends a message');
  const snippet = await page.$eval('#snippet', (el) => el.textContent);
  ok(snippet.includes('mode="enquiry"'), 'the embed code follows the controls');

  // Dark theme + yellow accent
  await page.locator('label:has(input[name="mode"][value="booking"])').click();
  await page.locator('label:has(input[name="theme"][value="dark"])').click();
  await page.locator('label:has(input[name="accent"][value="#facc15"])').click();
  await page.locator(`${W}.bw-option`).wait();
  await page.locator(`${W}.bw-option:nth-child(1)`).click();
  await page.locator(`${W}[data-act="to-time"]`).click();
  await page.locator(`${W}.bw-chip`).wait();
  await page.locator(`${W}.bw-chip:nth-child(1)`).click();
  await audit(page, 'dark theme with a yellow accent');
  await shot(page, '1440-5-dark-yellow');
  ok((await page.$eval('#contrast-note', (n) => n.textContent)).includes('dark text'), 'the colour note says yellow gets dark button text');

  // Any colour: the hex field drives the widget, the picker and the presets
  const accentState = () => page.evaluate(() => ({
    widget: document.querySelector('booking-widget').getAttribute('accent'),
    picker: document.getElementById('accent-picker').value,
    preset: document.querySelector('input[name="accent"]:checked')?.value || null,
    error: !document.getElementById('accent-hex-error').hidden,
    note: document.getElementById('contrast-note').textContent,
    snippet: document.getElementById('snippet').textContent,
  }));
  await page.locator('#accent-hex').fill('#E4572E');
  let a = await accentState();
  ok(a.widget === '#e4572e' && a.picker === '#e4572e' && a.preset === null && a.snippet.includes('accent="#e4572e"'),
    'a typed hex code colours the widget, moves the picker and goes into the embed code', JSON.stringify(a));
  await page.locator('#accent-hex').fill('#777777');
  a = await accentState();
  ok(a.note.includes('so buttons use'), 'a mid-grey that fails with both text colours is deepened, and the note says so', a.note);
  await page.locator('#accent-hex').fill('zzz');
  await page.keyboard.press('Tab');
  a = await accentState();
  ok(a.error && a.widget === '#777777', 'a bad hex code shows an error and leaves the colour alone', JSON.stringify(a));
  await page.locator('#accent-hex').fill('0F766E');
  await page.keyboard.press('Enter');
  a = await accentState();
  ok(!a.error && a.preset === '#0f766e' && a.widget === '#0f766e', 'typing a preset\'s code selects that preset', JSON.stringify(a));
  await audit(page, 'colour controls after use');

  // Custom theme: any background colour, with the text and borders worked out from it
  ok(await page.$eval('#theme-custom', (el) => el.hidden), 'the background picker stays hidden until Custom is chosen');
  await page.locator('label:has(input[name="theme"][value="custom"])').click();
  const bgState = () => page.evaluate(() => {
    const w = document.querySelector('booking-widget');
    const card = w.shadowRoot.querySelector('.bw');
    return {
      background: w.getAttribute('background'), theme: w.getAttribute('theme'), base: card.dataset.theme,
      bg: card.style.getPropertyValue('--bw-bg'), siteBg: getComputedStyle(document.getElementById('site')).getPropertyValue('--site-bg').trim(),
      picker: document.getElementById('bg-picker').value, note: document.getElementById('bg-note').textContent,
      snippet: document.getElementById('snippet').textContent, shown: !document.getElementById('theme-custom').hidden,
    };
  });
  let b = await bgState();
  ok(b.shown && b.background === '#f3ede2' && b.theme === null && b.bg === '#f3ede2' && b.base === 'light'
    && b.snippet.includes('background="#f3ede2"') && !b.snippet.includes('theme='),
  'Custom shows the background picker, colours the widget and swaps theme for background in the embed code', JSON.stringify(b));
  ok(b.siteBg === '#f3ede2', 'the mock site behind the widget takes the same background', b.siteBg);
  await audit(page, 'custom cream background');
  await page.locator('#bg-hex').fill('#221d13');
  b = await bgState();
  ok(b.bg === '#221d13' && b.base === 'dark' && b.picker === '#221d13' && b.note.includes('light text'), 'a dark brown background gets light text', JSON.stringify(b));
  await audit(page, 'custom dark brown background');
  await shot(page, '1440-5b-custom-brown');
  await page.locator('#bg-hex').fill('#b91c1c');
  b = await bgState();
  ok(b.bg !== '#b91c1c' && b.note.includes('moves to'), 'a red that can\'t hold clear text is deepened, and the note says so', JSON.stringify(b));
  await audit(page, 'custom red background');
  // Some colour pickers only fire change when they close.
  await page.$eval('#bg-picker', (el) => { el.value = '#1e3a8a'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.$eval('#accent-picker', (el) => { el.value = '#ff8800'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  b = await bgState();
  ok(b.background === '#1e3a8a' && b.bg === '#1e3a8a' && b.siteBg === '#1e3a8a' && b.snippet.includes('accent="#ff8800"'), 'both pickers work when they only fire change', JSON.stringify(b));
  await page.locator('#bg-hex').fill('#b91c1c');
  await page.locator('#bg-hex').fill('nope');
  await page.keyboard.press('Tab');
  ok(!(await page.$eval('#bg-hex-error', (el) => el.hidden)) && (await bgState()).background === '#b91c1c', 'a bad background hex shows an error and keeps the colour');
  await page.locator('label:has(input[name="theme"][value="dark"])').click();
  b = await bgState();
  ok(!b.shown && b.background === null && b.theme === 'dark' && b.base === 'dark' && b.bg === '' && b.siteBg !== '#941616',
    'switching back to Dark drops the custom colours from the widget and the mock site', JSON.stringify(b));

  // Popup
  await page.locator('label:has(input[name="theme"][value="light"])').click();
  await page.locator('label:has(input[name="display"][value="popup"])').click();
  await page.locator(`${W}.bw-launch`).click();
  await page.locator(`${W}.bw-option`).wait();
  const open = await page.$eval(`${W}dialog`, (d) => d.open);
  ok(open, 'the popup button opens the dialog');
  await shot(page, '1440-6-popup');
  await page.keyboard.press('Escape');
  await wait(400);
  ok(!(await page.$eval(`${W}dialog`, (d) => d.open)), 'Escape closes the popup');
}

async function inbox(browser, width) {
  // A fresh context per run, so no signed-in session carries over.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: width < 600 ? 844 : 900, isMobile: width < 600, hasTouch: width < 600 });
  await page.goto(`${BASE}/admin/?site=demo`, { waitUntil: 'load' });
  await audit(page, `${width}px inbox sign-in`);
  await page.locator('#key').fill('wrong-key');
  await page.locator('#signin button[type="submit"]').click();
  await page.locator('#signin-error:not([hidden])').wait();
  ok(true, `${width}px: a wrong key shows an error`);
  await page.locator('#fill-demo').click();
  await page.locator('.req').wait();
  await hiddenStaysHidden(page, `${width}px inbox`);
  await audit(page, `${width}px inbox`);
  await shot(page, `inbox-${width}`);
  if (width > 600) {
    const confirm = await page.$('.req button[data-to="confirmed"]');
    await confirm.click();
    await page.waitForFunction(() => document.querySelector('.pill-confirmed'));
    ok(true, 'Confirm in the inbox marks a request confirmed');
  }
  await context.close();
}

// ---------------------------------------------------------------- run
sql('DELETE FROM holds; DELETE FROM requests;');
await apiChecks();
sql('DELETE FROM holds; DELETE FROM requests;');

const chrome = Launcher.getInstallations()[0];
if (!chrome) throw new Error('Google Chrome was not found');
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--force-color-profile=srgb'] });
try {
  const page = await browser.newPage();
  console.log('\n== Browser ==');
  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    await bookingFlow(page, width);
  }
  await variants(page);
  for (const width of [390, 1440]) await inbox(browser, width);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.locator(`${W}.bw-option`).wait();
  await page.screenshot({ path: join(OUT, '390-full.png'), fullPage: true });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.locator(`${W}.bw-option`).wait();
  await page.screenshot({ path: join(OUT, '1440-full.png'), fullPage: true });
} finally {
  await browser.close();
}

console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All checks passed'}. Screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
