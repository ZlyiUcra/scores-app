import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { HelpEn } from './help/HelpEn';
import { HelpUa } from './help/HelpUa';
import { HelpPt } from './help/HelpPt';

/** User guide. The body is long-form prose with markup, so it lives as one
 * component per language (help/Help*.tsx) instead of the JSON catalogs; this
 * wrapper only picks the body for the active language. Admin sections render
 * only for admins - viewers have nothing to do with those controls. */
export function Help() {
  const { isAdmin } = useAuth();
  const { t, lang } = useI18n();
  const Body = lang === 'ua' ? HelpUa : lang === 'pt' ? HelpPt : HelpEn;
  return (
    <div className="help">
      <div className="list__head">
        <h2>{t('nav.help')}</h2>
      </div>
      <Body isAdmin={isAdmin} />
    </div>
  );
}
