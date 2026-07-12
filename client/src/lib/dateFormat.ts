// Template-driven date/time formatting and parsing for DateField. Pure and
// self-contained (no React, no app i18n) so the picker can be lifted out and
// reused. The template decides field ORDER, separators, 12- vs 24-hour and the
// AM/PM marker; the canonical value is timezone-honest: an ISO instant when the
// template has a time, otherwise a date-only "YYYY-MM-DD".
//
// Tokens (case-sensitive, dayjs-style): DD day, MM month, YYYY year,
// HH hour 24h, hh hour 12h, mm minute, A meridiem. Anything else is a literal
// separator. Examples: "DD.MM.YYYY", "DD.MM.YYYY HH:mm", "MM/DD/YYYY hh:mm A".

/** Zero-pad to two digits (shared by the pickers and the app format helpers). */
export const p2 = (n: number) => String(n).padStart(2, '0');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text shown for calendar/weekday chrome. English defaults live in DEFAULT_DATE_LABELS. */
export type DateLabels = {
  /** 12 month names, January first. */
  months: string[];
  /** 7 weekday abbreviations, Monday first. */
  weekdays: string[];
  am: string;
  pm: string;
  today: string;
  clear: string;
  calendar: string;
  prevMonth: string;
  nextMonth: string;
  prevYear: string;
  nextYear: string;
  hour: string;
  minute: string;
  from: string;
  to: string;
};

export const DEFAULT_DATE_LABELS: DateLabels = {
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  am: 'AM',
  pm: 'PM',
  today: 'Today',
  clear: 'Clear',
  calendar: 'Open calendar',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  prevYear: 'Previous year',
  nextYear: 'Next year',
  hour: 'Hour',
  minute: 'Minute',
  from: 'From',
  to: 'To',
};

/** Broken-down local date/time. `h24` is always 0-23 regardless of template. */
export type DateParts = { y: number; mo: number; d: number; h24: number; mi: number };

const tokenPattern = /^(YYYY|DD|MM|HH|hh|mm|A)/;

/** Split a template into tokens and literal separators, in order. */
export function tokenize(format: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < format.length; ) {
    const m = tokenPattern.exec(format.slice(i));
    if (m) {
      out.push(m[0]);
      i += m[0].length;
    } else {
      out.push(format[i]);
      i += 1;
    }
  }
  return out;
}

const timeTokens = new Set(['HH', 'hh', 'mm', 'A']);

export function formatHasTime(format: string): boolean {
  return tokenize(format).some((tk) => timeTokens.has(tk));
}

export function formatIsTwelveHour(format: string): boolean {
  const toks = tokenize(format);
  return toks.includes('hh') || toks.includes('A');
}

/** 0-23 -> 1-12 for the 12-hour token. */
export const to12 = (h24: number) => ((h24 + 11) % 12) + 1;

/** DateParts -> display text in the template's shape. */
export function renderDate(parts: DateParts, format: string, labels: DateLabels): string {
  return tokenize(format)
    .map((tk) => {
      switch (tk) {
        case 'YYYY':
          return String(parts.y);
        case 'MM':
          return p2(parts.mo);
        case 'DD':
          return p2(parts.d);
        case 'HH':
          return p2(parts.h24);
        case 'hh':
          return p2(to12(parts.h24));
        case 'mm':
          return p2(parts.mi);
        case 'A':
          return parts.h24 < 12 ? labels.am : labels.pm;
        default:
          return tk;
      }
    })
    .join('');
}

/** Canonical value -> DateParts, or null when the value is absent/malformed. */
export function decodeValue(value: string | null, format: string): DateParts | null {
  if (!value) return null;
  if (!formatHasTime(format)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? { y: +m[1], mo: +m[2], d: +m[3], h24: 0, mi: 0 } : null;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), h24: dt.getHours(), mi: dt.getMinutes() };
}

/** DateParts -> canonical value (ISO instant with time, else "YYYY-MM-DD"). */
export function encodeValue(parts: DateParts, format: string): string {
  if (!formatHasTime(format)) return `${parts.y}-${p2(parts.mo)}-${p2(parts.d)}`;
  return new Date(parts.y, parts.mo - 1, parts.d, parts.h24, parts.mi).toISOString();
}

/**
 * Parse display text against the template into a canonical value, or null when
 * it is not a real, complete date. Lenient about leading zeros and whitespace;
 * the AM/PM marker matches the label or a plain AM/PM.
 */
export function parseDate(text: string, format: string, labels: DateLabels): string | null {
  const tokens = tokenize(format);
  const groups: string[] = [];
  let re = '^\\s*';
  for (const tk of tokens) {
    switch (tk) {
      case 'YYYY':
        re += '(\\d{4})';
        groups.push(tk);
        break;
      case 'MM':
      case 'DD':
      case 'HH':
      case 'hh':
      case 'mm':
        re += '(\\d{1,2})';
        groups.push(tk);
        break;
      case 'A': {
        const alts = [labels.am, labels.pm, 'AM', 'PM'].map(escapeRe).join('|');
        re += `(${alts})`;
        groups.push(tk);
        break;
      }
      default:
        re += /\s/.test(tk) ? '\\s+' : escapeRe(tk);
    }
  }
  re += '\\s*$';
  const m = new RegExp(re, 'i').exec(text.trim());
  if (!m) return null;

  const v: Record<string, string> = {};
  groups.forEach((g, i) => (v[g] = m[i + 1]));

  const y = Number(v.YYYY);
  const mo = Number(v.MM);
  const d = Number(v.DD);
  let h24 = 0;
  let mi = 0;
  if (formatHasTime(format)) {
    mi = Number(v.mm ?? '0');
    if (v.hh != null) {
      const h = Number(v.hh) % 12; // 12 -> 0
      const isPm = v.A != null && (v.A.toLowerCase() === labels.pm.toLowerCase() || v.A.toLowerCase() === 'pm');
      h24 = isPm ? h + 12 : h;
    } else {
      h24 = Number(v.HH ?? '0');
    }
  }

  if ([y, mo, d, h24, mi].some(Number.isNaN)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h24 > 23 || mi > 59) return null;
  // Round-trip through Date to reject impossible days (31.02 etc.).
  const dt = new Date(y, mo - 1, d, h24, mi);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;

  return encodeValue({ y, mo, d, h24, mi }, format);
}

// ---- Time-only helpers (for a time-of-day / time-range control) ----
// Canonical time is a 24-hour "HH:mm" string; the template (HH/hh/mm/A) is
// display-only, exactly like the date side above.

export type TimeParts = { h24: number; mi: number };

/** "HH:mm" (24h) -> {h24, mi}, or null when absent/malformed. */
export function decodeTime(value: string | null): TimeParts | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h24 = Number(m[1]);
  const mi = Number(m[2]);
  return h24 <= 23 && mi <= 59 ? { h24, mi } : null;
}

/** {h24, mi} -> canonical "HH:mm". */
export function encodeTime(t: TimeParts): string {
  return `${p2(t.h24)}:${p2(t.mi)}`;
}

/** {h24, mi} -> display text per a time template (HH/hh/mm/A). */
export function renderTime(t: TimeParts, format: string, labels: DateLabels): string {
  return tokenize(format)
    .map((tk) => {
      switch (tk) {
        case 'HH':
          return p2(t.h24);
        case 'hh':
          return p2(to12(t.h24));
        case 'mm':
          return p2(t.mi);
        case 'A':
          return t.h24 < 12 ? labels.am : labels.pm;
        default:
          return tk;
      }
    })
    .join('');
}

/** Parse a time-only string against the template -> canonical "HH:mm", or null. */
export function parseTime(text: string, format: string, labels: DateLabels): string | null {
  const tokens = tokenize(format);
  const groups: string[] = [];
  let re = '^\\s*';
  for (const tk of tokens) {
    switch (tk) {
      case 'HH':
      case 'hh':
      case 'mm':
        re += '(\\d{1,2})';
        groups.push(tk);
        break;
      case 'A': {
        const alts = [labels.am, labels.pm, 'AM', 'PM'].map(escapeRe).join('|');
        re += `(${alts})`;
        groups.push(tk);
        break;
      }
      default:
        re += /\s/.test(tk) ? '\\s+' : escapeRe(tk);
    }
  }
  re += '\\s*$';
  const m = new RegExp(re, 'i').exec(text.trim());
  if (!m) return null;
  const v: Record<string, string> = {};
  groups.forEach((g, i) => (v[g] = m[i + 1]));
  let h24 = 0;
  const mi = Number(v.mm ?? '0');
  if (v.hh != null) {
    const h = Number(v.hh) % 12;
    const isPm = v.A != null && (v.A.toLowerCase() === labels.pm.toLowerCase() || v.A.toLowerCase() === 'pm');
    h24 = isPm ? h + 12 : h;
  } else {
    h24 = Number(v.HH ?? '0');
  }
  if ([h24, mi].some(Number.isNaN) || h24 > 23 || mi > 59) return null;
  return `${p2(h24)}:${p2(mi)}`;
}
