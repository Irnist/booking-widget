// Checks a visitor's request. The widget runs this before sending, and the
// Worker runs it again on what arrives, so both always agree.
import { isDate, isTime } from './time.js';

export const CONTACT_VIA = { call: 'Phone call', text: 'Text message', email: 'Email' };

// Under this many milliseconds between showing the form and sending it, the
// sender is almost certainly a bot.
export const MIN_FILL_MS = 2500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/**
 * @returns {{ ok: boolean, errors: Record<string,string>, value: object, spam: boolean }}
 * `errors` is keyed by field name with a message a visitor can act on.
 */
export function validateRequest(site, body = {}) {
  const errors = {};
  const kind = body.kind === 'enquiry' ? 'enquiry' : 'booking';
  const value = {
    kind,
    service: clean(body.service, 60) || null,
    date: kind === 'booking' ? clean(body.date, 10) : null,
    time: kind === 'booking' ? clean(body.time, 5) : null,
    name: clean(body.name, 80),
    contactVia: clean(body.contactVia, 10),
    phone: clean(body.phone, 30),
    email: clean(body.email, 120).toLowerCase(),
    // Keep line breaks in the message; only trim and cap it.
    message: typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '',
  };

  const service = site.services.find((s) => s.id === value.service);
  if (value.service && !service) errors.service = 'Choose a service from the list.';
  if (kind === 'booking') {
    if (!service) errors.service = 'Choose a service.';
    if (!isDate(value.date) || !isTime(value.time)) errors.time = 'Choose a day and time.';
  }

  if (value.name.length < 2) errors.name = 'Enter your name.';

  if (!CONTACT_VIA[value.contactVia]) {
    errors.contactVia = 'Choose how we should reach you.';
  }
  const digits = value.phone.replace(/\D/g, '');
  const needsPhone = value.contactVia === 'call' || value.contactVia === 'text';
  if (needsPhone && !value.phone) errors.phone = 'Enter a phone number so we can reach you.';
  else if (value.phone && (digits.length < 7 || digits.length > 15 || /[^\d\s()+.\-]/.test(value.phone))) {
    errors.phone = 'Enter a phone number with 7 to 15 digits.';
  }
  if (value.contactVia === 'email' && !value.email) errors.email = 'Enter an email address so we can reply.';
  else if (value.email && !EMAIL.test(value.email)) errors.email = 'Enter an email address like name@example.com.';

  if (kind === 'enquiry' && value.message.length < 5) errors.message = 'Tell us a little about what you need.';

  // Honeypot field and fill time: silent checks, never shown as errors.
  const spam = Boolean(body.website) || !(Number(body.elapsedMs) >= MIN_FILL_MS);

  return { ok: Object.keys(errors).length === 0, errors, value, spam };
}
