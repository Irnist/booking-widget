// Which start times are open, given a site's hours and the slots already held.
import { DAY_KEYS, addDays, dayNumber, fromMinutes, toMinutes, weekday, zonedNow } from './time.js';

/** The grid cells (start times) a booking of `minutes` starting at `time` occupies. */
export function cellsFor(time, minutes, slotMinutes) {
  const start = toMinutes(time);
  const count = Math.max(1, Math.ceil(minutes / slotMinutes));
  return Array.from({ length: count }, (_, i) => fromMinutes(start + i * slotMinutes));
}

/** The dates a visitor may book: today through `daysAhead - 1` days from now. */
export function bookableRange(site, now = new Date()) {
  const today = zonedNow(site.timezone, now).date;
  return { first: today, last: addDays(today, site.daysAhead - 1) };
}

/**
 * Open start times per date for a service.
 * @param site      site config (timezone, hours, slotMinutes, noticeMinutes, daysAhead, closed)
 * @param minutes   length of the service
 * @param held      Set of "YYYY-MM-DD HH:MM" cells already taken
 * @param now       current instant
 * @returns { "YYYY-MM-DD": ["HH:MM", …] } for every date in the bookable range
 */
export function openTimes(site, { minutes, held = new Set(), now = new Date() }) {
  const { date: today, minutes: nowMin } = zonedNow(site.timezone, now);
  // Earliest bookable moment, as minutes on a running clock across days.
  const earliest = dayNumber(today) * 1440 + nowMin + site.noticeMinutes;
  const closed = new Set(site.closed || []);
  const out = {};

  for (let i = 0; i < site.daysAhead; i++) {
    const date = addDays(today, i);
    const times = [];
    out[date] = times;
    if (closed.has(date)) continue;

    for (const [open, close] of site.hours[DAY_KEYS[weekday(date)]] || []) {
      const end = toMinutes(close);
      for (let t = toMinutes(open); t + minutes <= end; t += site.slotMinutes) {
        if (dayNumber(date) * 1440 + t < earliest) continue;
        const start = fromMinutes(t);
        const free = cellsFor(start, minutes, site.slotMinutes).every((c) => !held.has(`${date} ${c}`));
        if (free) times.push(start);
      }
    }
  }
  return out;
}

/** Whether one specific date and time is open right now. */
export function isOpen(site, { date, time, minutes, held, now }) {
  return (openTimes(site, { minutes, held, now })[date] || []).includes(time);
}
