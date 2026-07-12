import { useI18n } from '../i18n';
import { formatKickoff, formatTime } from './format';

/**
 * App-side bridge for format.ts's kickoff-time helpers: binds the locale's
 * hour/minute indicator letter (i18n `date.hourIndicator`) so callers never
 * hardcode it. Kept separate from useDateLabels.ts - that one is the
 * DateField/TimeField pickers' own chrome (colon divider, am/pm, etc.), a
 * different, untouched concern from this app-wide kickoff-time display.
 */
export function useKickoffFormat() {
  const { t } = useI18n();
  const hourIndicator = t('date.hourIndicator');
  return {
    formatTime: (iso: string) => formatTime(iso, hourIndicator),
    formatKickoff: (iso: string) => formatKickoff(iso, hourIndicator),
  };
}
