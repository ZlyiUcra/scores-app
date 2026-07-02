import { useBracketStore, selectBracket } from '../bracketStore';
import { Bracket } from '../components/Bracket';
import { useI18n } from '../i18n';

export function Eliminatorias() {
  const { t } = useI18n();
  const view = useBracketStore(selectBracket);

  return (
    <div className="ko-page">
      <div className="list__head">
        <h2>{t('nav.knockout')}</h2>
      </div>
      <Bracket view={view} />
      <p className="muted ko-note">{t('bracket.note')}</p>
    </div>
  );
}
