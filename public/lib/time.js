// Time helpers. DB stores UTC ISO strings; everything shown to the user goes through a timezone here.
// Pure functions (no DOM) so node:test can import them.

const formatters = new Map();
function parts(date, timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

// UTC ISO -> 'YYYY-MM-DDTHH:mm' wall clock in timeZone (also the value format of <input type="datetime-local">)
export function toLocal(iso, timeZone) {
  const p = parts(new Date(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const localAsUtcMs = (local) => Date.parse(`${local}:00Z`);

// 'YYYY-MM-DDTHH:mm' wall clock in timeZone -> UTC ISO. Two passes handle DST offsets.
export function localToUtc(local, timeZone) {
  const wanted = localAsUtcMs(local);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    guess = wanted - (localAsUtcMs(toLocal(new Date(guess).toISOString(), timeZone)) - guess);
  }
  return new Date(guess).toISOString();
}

export const fmtTime = (iso, timeZone) => toLocal(iso, timeZone).replace('T', ' ');
export const dayKey = (iso, timeZone) => toLocal(iso, timeZone).slice(0, 10);
export const hourOf = (iso, timeZone) => Number(toLocal(iso, timeZone).slice(11, 13));
// 0 = Monday ... 6 = Sunday
export function weekdayOf(iso, timeZone) {
  const [y, m, d] = dayKey(iso, timeZone).split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
