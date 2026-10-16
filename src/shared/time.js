// Date and time helpers. Dates are "YYYY-MM-DD" strings and times "HH:MM"
// strings in the business's own time zone; nothing here depends on the
// time zone of the machine it runs on.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Days since 1970-01-01 for a date string, so dates can be compared and subtracted. */
export const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

export const fromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const addDays = (date, n) => fromDayNumber(dayNumber(date) + n);

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Wall-clock parts of an instant in a time zone. */
function wallClock(tz, instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** Today's date and the minutes past midnight at the business. */
export function zonedNow(tz, now = new Date()) {
  const w = wallClock(tz, now);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, minutes: w.h * 60 + w.mi };
}

/** The UTC instant of a local date and time in a time zone (DST-aware). */
export function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  // Two passes settle the offset on either side of a DST change.
  for (let i = 0; i < 2; i++) {
    const w = wallClock(tz, new Date(guess));
    const shown = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
    guess += target - shown;
  }
  return new Date(guess);
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
