import { useI18n } from '../i18n';

/**
 * Fallback for a failed INITIAL data load (tournament list, per-tournament
 * feed). Those fetches are not user actions, so a failure has no other error
 * surface - without this the screen sits on "Loading..." forever. Shows a short
 * message and a manual retry (no auto-retry, no toast).
 */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="splash load-error">
      <p className="muted">{t('app.loadError')}</p>
      <button type="button" className="btn btn--sm" onClick={onRetry}>
        {t('app.retry')}
      </button>
    </div>
  );
}
