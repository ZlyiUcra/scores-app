import { p2 } from './dateFormat';

/** "19h30" — the app-wide kickoff-time format; empty when unset/invalid. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getHours())}h${p2(d.getMinutes())}`;
}

// The app-wide DATE format is dd.mm.yyyy — both in displays and in the typed
// date inputs (native pickers follow the OS locale, so we do not use them).

/** Date -> "03.07.2026". A date-only string ("2026-07-03") is reordered as-is
 * (no timezone math); anything else is read as a local-time instant. */
export function formatDay(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "3.7.2026" / "03.07.2026" -> "2026-07-03"; null when not a real date. */
export function parseDay(text: string): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Round-trip through Date to reject 31.02 and friends.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${p2(month)}-${p2(day)}`;
}

/** ISO instant -> "03.07.2026 19:30" in the local timezone; '' when unset. */
export function formatDayTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "03.07.2026 19:30" (local time) -> ISO instant; null when invalid. */
export function parseDayTime(text: string): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})[ ,]+(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const [day, month, year, hh, mm] = m.slice(1).map(Number);
  if (hh > 23 || mm > 59) return null;
  const d = new Date(year, month - 1, day, hh, mm);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.toISOString();
}
