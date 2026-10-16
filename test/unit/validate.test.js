import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSite, publicSite } from '../../src/shared/site.js';
import { validateRequest } from '../../src/shared/validate.js';

const site = normalizeSite(JSON.parse(readFileSync(new URL('../../sites/demo.json', import.meta.url), 'utf8')));
const good = {
  kind: 'booking', service: 'skin-fade', date: '2026-10-20', time: '10:00',
  name: 'Jordan Lee', contactVia: 'text', phone: '(555) 010-0199', email: '', message: '', elapsedMs: 9000,
};

test('a complete booking passes', () => {
  const r = validateRequest(site, good);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.spam, false);
});

test('the reply route decides which contact field is required', () => {
  assert.ok(validateRequest(site, { ...good, phone: '' }).errors.phone, 'text needs a phone');
  assert.ok(validateRequest(site, { ...good, contactVia: 'call', phone: '' }).errors.phone, 'call needs a phone');
  const email = validateRequest(site, { ...good, contactVia: 'email', phone: '' });
  assert.ok(email.errors.email, 'email needs an email');
  assert.equal(validateRequest(site, { ...good, contactVia: 'email', phone: '', email: 'jo@example.com' }).ok, true);
  assert.ok(validateRequest(site, { ...good, contactVia: '' }).errors.contactVia, 'no route chosen');
});

test('bad values get specific messages', () => {
  assert.ok(validateRequest(site, { ...good, phone: '12' }).errors.phone);
  assert.ok(validateRequest(site, { ...good, phone: 'call me' }).errors.phone);
  assert.ok(validateRequest(site, { ...good, email: 'nope' }).errors.email, 'a wrong optional email is still an error');
  assert.ok(validateRequest(site, { ...good, service: 'nope' }).errors.service);
  assert.ok(validateRequest(site, { ...good, time: '25:00' }).errors.time);
  assert.ok(validateRequest(site, { ...good, name: ' ' }).errors.name);
});

test('an enquiry needs a message but no service or time', () => {
  const enquiry = { kind: 'enquiry', name: 'Sam', contactVia: 'email', email: 'sam@example.com', elapsedMs: 9000 };
  assert.ok(validateRequest(site, enquiry).errors.message);
  const r = validateRequest(site, { ...enquiry, message: 'Do you do walk-ins?' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.date, null);
});

test('honeypot and instant submissions are flagged as spam, not errors', () => {
  assert.equal(validateRequest(site, { ...good, website: 'http://spam' }).spam, true);
  assert.equal(validateRequest(site, { ...good, elapsedMs: 300 }).spam, true);
  assert.equal(validateRequest(site, { ...good, elapsedMs: 300 }).ok, true);
});

test('site configs are checked, and the public view hides secrets', () => {
  assert.throws(() => normalizeSite({ ...site, timezone: 'Central' }), /timezone/);
  assert.throws(() => normalizeSite({ ...site, hours: { mon: [['17:00', '09:00']] } }), /hours\.mon/);
  assert.throws(() => normalizeSite({ ...site, services: [{ id: 'a', name: 'A', minutes: 30 }, { id: 'a', name: 'B', minutes: 30 }] }), /used twice/);
  assert.throws(() => normalizeSite({ ...site, adminKeyHash: 'secret' }), /adminKeyHash/);
  const pub = publicSite(site);
  assert.equal(pub.adminKeyHash, undefined);
  assert.equal(pub.notify, undefined);
  assert.equal(pub.allowedOrigins, undefined);
});
