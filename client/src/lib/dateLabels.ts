import { useMemo } from 'react';
import { useI18n } from '../i18n';
import type { DateLabels } from './dateFormat';

/**
 * App-side bridge: DateField takes plain `labels` (so it stays i18n-agnostic and
 * reusable); this reads them from the active language. Month/weekday lists are
 * stored comma-joined in the catalogs (the translator returns strings only).
 */
export function useDateLabels(): DateLabels {
  const { t, lang } = useI18n();
  return useMemo<DateLabels>(
    () => ({
      months: t('date.months').split(','),
      weekdays: t('date.weekdays').split(','),
      am: t('date.am'),
      pm: t('date.pm'),
      today: t('date.today'),
      clear: t('date.clear'),
      calendar: t('date.calendar'),
      prevMonth: t('date.prevMonth'),
      nextMonth: t('date.nextMonth'),
      prevYear: t('date.prevYear'),
      nextYear: t('date.nextYear'),
      hour: t('date.hour'),
      minute: t('date.minute'),
      from: t('date.from'),
      to: t('date.to'),
    }),
    // t is stable per language; recompute when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );
}
