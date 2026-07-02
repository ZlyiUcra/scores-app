import { useBracketStore, selectBracket } from '../stores/bracketStore';
import { Bracket } from '../components/Bracket';
import { useI18n } from '../i18n';

export function Knockout() {
  const { t } = useI18n();
  const view = useBracketStore(selectBracket);

  // Any projected side means the whole page is a live projection.
  const preview = view.matches.some(
    (m) => ('seed' in m.home && m.home.projected) || ('seed' in m.away && m.away.projected),
  );

  return (
    <div className="ko-page">
      <div className="list__head">
        <h2>{t('nav.knockout')}</h2>
      </div>
      {preview && <p className="ko-preview-note">{t('bracket.previewNote')}</p>}
      <Bracket view={view} />
      <p className="muted ko-note">{t('bracket.note')}</p>
    </div>
  );
}
