// How dates and times read to people. Dates are business-local strings, so
// they're formatted in UTC to stop the viewer's own time zone shifting them.

const dateFmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
const at = (date) => new Date(`${date}T12:00:00Z`);

/** "1:30 PM" from "13:30". */
export function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Tuesday, October 20" (long) or "Tue, Oct 20" (short). */
export function formatDate(date, style = 'long') {
  return style === 'long'
    ? dateFmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(at(date))
    : dateFmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(at(date));
}

/** "October 2026" from "2026-10". */
export const formatMonth = (month) => dateFmt({ month: 'long', year: 'numeric' }).format(at(`${month}-01`));

/** "Tue, Oct 20 at 1:30 PM", or null for an enquiry with no time. */
export function describeWhen(r) {
  return r.date && r.time ? `${formatDate(r.date, 'short')} at ${formatTime(r.time)}` : null;
}

/** "Central Time" for "America/Chicago", falling back to the city name. */
export function timeZoneLabel(tz) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    if (part && !/^GMT/.test(part.value)) return part.value;
  } catch { /* older engines: fall through */ }
  return `${tz.split('/').pop().replace(/_/g, ' ')} time`;
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
