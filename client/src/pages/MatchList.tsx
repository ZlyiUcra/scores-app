import { useMatchStore, selectOrder, selectConnected } from '../store';
import { useI18n } from '../i18n';
import { MatchRow } from '../components/MatchRow';

export function MatchList() {
  const order = useMatchStore(selectOrder);
  const connected = useMatchStore(selectConnected);
  const { t } = useI18n();

  return (
    <div className="list">
      <div className="list__head">
        <h2>{t('matchList.title')}</h2>
        <span className={`live-dot ${connected ? 'live-dot--on' : 'live-dot--off'}`}>
          {connected ? t('matchList.live') : t('matchList.offline')}
        </span>
      </div>

      {order.length === 0 ? (
        <p className="muted">{t('matchList.loading')}</p>
      ) : (
        <div className="list__grid">
          {order.map((id) => (
            <MatchRow key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}
