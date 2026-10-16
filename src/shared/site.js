// Reads a site config (sites/<id>.json), fills in defaults and refuses
// anything that would make the widget misbehave. The build runs it on every
// site, so a typo fails the build instead of a visitor's booking.
import { DAY_KEYS, isDate, isTime, isValidTimeZone, toMinutes } from './time.js';

const DEFAULTS = {
  mode: 'booking',
  slotMinutes: 30,
  noticeMinutes: 120,
  daysAhead: 30,
  closed: [],
  replyTime: 'within one business day',
  allowedOrigins: ['*'],
  notify: {},
  demo: false,
};

export function normalizeSite(raw, file = 'site') {
  const site = { ...DEFAULTS, ...raw };
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };

  if (!/^[a-z0-9-]{2,40}$/.test(site.id || '')) fail('"id" must be 2-40 lowercase letters, digits or dashes');
  if (!site.name) fail('"name" is required');
  if (!isValidTimeZone(site.timezone)) fail(`"timezone" ${JSON.stringify(site.timezone)} is not an IANA time zone like "America/Chicago"`);
  if (!['booking', 'enquiry'].includes(site.mode)) fail('"mode" must be "booking" or "enquiry"');
  if (!(site.slotMinutes >= 5 && site.slotMinutes <= 240)) fail('"slotMinutes" must be 5-240');
  if (!(site.daysAhead >= 1 && site.daysAhead <= 180)) fail('"daysAhead" must be 1-180');
  if (!(site.noticeMinutes >= 0)) fail('"noticeMinutes" must be 0 or more');
  if (!/^[0-9a-f]{64}$/.test(site.adminKeyHash || '')) fail('"adminKeyHash" must be a SHA-256 hex digest (run npm run new-site)');

  if (!Array.isArray(site.services) || !site.services.length) fail('"services" needs at least one service');
  const ids = new Set();
  for (const s of site.services) {
    if (!/^[a-z0-9-]{1,40}$/.test(s.id || '')) fail(`service id ${JSON.stringify(s.id)} must be lowercase letters, digits or dashes`);
    if (ids.has(s.id)) fail(`service id "${s.id}" is used twice`);
    ids.add(s.id);
    if (!s.name) fail(`service "${s.id}" needs a name`);
    if (!(s.minutes >= 5 && s.minutes <= 600)) fail(`service "${s.id}" minutes must be 5-600`);
  }

  site.hours = site.hours || {};
  for (const day of DAY_KEYS) {
    const ranges = site.hours[day] || [];
    site.hours[day] = ranges;
    for (const [open, close] of ranges) {
      // "24:00" closes at midnight, so ["00:00", "24:00"] is open all day.
      if (!isTime(open) || !(isTime(close) || close === '24:00') || toMinutes(open) >= toMinutes(close)) {
        fail(`hours.${day} has a bad range ${JSON.stringify([open, close])}; use ["09:00", "17:00"] or ["00:00", "24:00"]`);
      }
    }
  }
  for (const d of site.closed) if (!isDate(d)) fail(`closed date ${JSON.stringify(d)} must be YYYY-MM-DD`);
  return site;
}

/** The part of a site config the widget is allowed to see. */
export function publicSite(site) {
  const { id, name, timezone, mode, slotMinutes, daysAhead, services, replyTime, phone, demo } = site;
  return { id, name, timezone, mode, slotMinutes, daysAhead, services, replyTime, phone: phone || null, demo };
}
