import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { useI18n, LANGS } from '../i18n';

type Mode = 'login' | 'register';

/** Sign-in / registration screen shown to anyone without a session. In dev
 * builds it also prints the seeded demo credentials. */
export function Login() {
  const { login, register } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const action = isRegister ? register : login;
      await action(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={onSubmit}>
        <div className="lang lang--center" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`lang__btn ${l === lang ? 'lang__btn--active' : ''}`}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <h1 className="login__title">⚽ Live Scores</h1>
        <p className="login__sub">{t('login.subtitle')}</p>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={`tabs__btn ${!isRegister ? 'tabs__btn--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            {t('login.tabLogin')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={`tabs__btn ${isRegister ? 'tabs__btn--active' : ''}`}
            onClick={() => switchMode('register')}
          >
            {t('login.tabRegister')}
          </button>
        </div>

        <label className="field">
          <span>{t('login.username')}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span>{t('login.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {isRegister && <p className="login__note">{t('login.registerNote')}</p>}

        {error && <p className="login__error">{error}</p>}

        <button className="btn btn--primary" disabled={busy} type="submit">
          {busy ? t('login.submitBusy') : isRegister ? t('login.submitRegister') : t('login.submitLogin')}
        </button>

        {/* Dev-only seed credentials — never shown in a production build. */}
        {import.meta.env.DEV && !isRegister && (
          <div className="login__hint">
            <div><b>{t('login.hintAdminLabel')}</b> admin / admin123</div>
            <div><b>{t('login.hintViewerLabel')}</b> viewer / viewer123</div>
          </div>
        )}
      </form>
    </div>
  );
}
