import { p2 } from './dateFormat';

/** "19h30" (or with the uk locale's own hour letter) - the app-wide kickoff-time format; empty when
 * unset/invalid. `hourIndicator` is the locale's hour/minute letter (i18n
 * `date.hourIndicator`) - this stays a plain, locale-free primitive; see
 * useKickoffFormat.ts for the app-bound version. */
export function formatTime(iso: string, hourIndicator: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getHours())}${hourIndicator}${p2(d.getMinutes())}`;
}

/** "03.07.2026 19h30" - date + hour together, for anywhere a match's
 * scheduled start needs the date alongside the hour (a tournament can span
 * more than one day). Empty when unset/invalid. */
export function formatKickoff(iso: string, hourIndicator: string): string {
  const time = formatTime(iso, hourIndicator);
  return time ? `${formatDay(iso)} ${time}` : '';
}

// The app-wide DATE format is dd.mm.yyyy - both in displays and in the typed
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
