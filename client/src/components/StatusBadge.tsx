import type { MatchStatus } from '../../../shared/types';
import { useI18n } from '../i18n';

export function StatusBadge({ status }: { status: MatchStatus }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge--${status}`}>
      {status === 'live' && <span className="badge__dot" aria-hidden />}
      {t(`status.${status}`)}
    </span>
  );
}
