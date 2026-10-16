import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellsFor, isOpen, openTimes } from '../../src/shared/slots.js';
import { zonedNow, zonedToUtc } from '../../src/shared/time.js';

const site = {
  timezone: 'America/Chicago',
  slotMinutes: 30,
  noticeMinutes: 60,
  daysAhead: 7,
  closed: ['2026-10-23'],
  hours: { mon: [['09:00', '12:00'], ['13:00', '17:00']], tue: [['09:00', '17:00']], wed: [], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [] },
};
// Monday 2026-10-19, 08:00 in Chicago (CDT, UTC-5).
const monday8am = new Date('2026-10-19T13:00:00Z');

test('cellsFor covers a booking in whole slots', () => {
  assert.deepEqual(cellsFor('09:00', 30, 30), ['09:00']);
  assert.deepEqual(cellsFor('09:00', 45, 30), ['09:00', '09:30']);
  assert.deepEqual(cellsFor('09:00', 60, 15), ['09:00', '09:15', '09:30', '09:45']);
  assert.deepEqual(cellsFor('09:00', 10, 30), ['09:00']);
});

test('open times follow opening hours, lunch breaks and closed days', () => {
  const dates = openTimes(site, { minutes: 60, now: monday8am });
  assert.equal(Object.keys(dates).length, 7);
  assert.deepEqual(dates['2026-10-19'], ['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00']);
  assert.deepEqual(dates['2026-10-21'], [], 'Wednesday is closed');
  assert.deepEqual(dates['2026-10-23'], [], 'closed date');
  assert.ok(!dates['2026-10-19'].includes('11:30'), 'a 60-minute service cannot run past 12:00');
});

test('notice period hides times that are too soon', () => {
  const nine = new Date('2026-10-19T14:10:00Z'); // 09:10 in Chicago, 60 min notice → 10:10
  const dates = openTimes(site, { minutes: 30, now: nine });
  assert.equal(dates['2026-10-19'][0], '10:30');
});

test('held cells block every start time that would overlap them', () => {
  const held = new Set(['2026-10-20 10:00']);
  const dates = openTimes(site, { minutes: 60, held, now: monday8am });
  assert.ok(!dates['2026-10-20'].includes('09:30'), '09:30-10:30 overlaps 10:00');
  assert.ok(!dates['2026-10-20'].includes('10:00'));
  assert.ok(dates['2026-10-20'].includes('09:00'));
  assert.ok(dates['2026-10-20'].includes('10:30'));
  assert.equal(isOpen(site, { date: '2026-10-20', time: '09:30', minutes: 60, held, now: monday8am }), false);
  assert.equal(isOpen(site, { date: '2026-10-20', time: '09:00', minutes: 60, held, now: monday8am }), true);
});

test('dates outside the bookable range are never open', () => {
  assert.equal(isOpen(site, { date: '2026-10-30', time: '09:00', minutes: 30, now: monday8am }), false);
  assert.equal(isOpen(site, { date: '2026-10-18', time: '09:00', minutes: 30, now: monday8am }), false);
});

test('time zone helpers handle DST changes', () => {
  assert.deepEqual(zonedNow('America/Chicago', monday8am), { date: '2026-10-19', minutes: 480 });
  assert.deepEqual(zonedNow('Asia/Manila', monday8am), { date: '2026-10-19', minutes: 21 * 60 });
  // CDT (UTC-5) before 1 Nov 2026, CST (UTC-6) after.
  assert.equal(zonedToUtc('2026-10-30', '09:00', 'America/Chicago').toISOString(), '2026-10-30T14:00:00.000Z');
  assert.equal(zonedToUtc('2026-11-02', '09:00', 'America/Chicago').toISOString(), '2026-11-02T15:00:00.000Z');
  assert.equal(zonedToUtc('2026-10-19', '09:00', 'Asia/Manila').toISOString(), '2026-10-19T01:00:00.000Z');
});
