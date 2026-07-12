import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import ua from './ua.json';
import pt from './pt.json';

// NOTE: 'ua' is used for Ukrainian by explicit project decision (ISO 639-1
// would be 'uk', but it reads as "United Kingdom" in the UI).
export type Lang = 'en' | 'ua' | 'pt';

// The internal 'ua' code is a deliberate in-app choice, but the <html lang>
// attribute is a real BCP-47 tag consumed by browsers/screen readers/
// translation prompts - it must say 'uk', not 'ua'.
const HTML_LANG: Record<Lang, string> = { en: 'en', ua: 'uk', pt: 'pt' };

/** Display order of the language switcher buttons. */
export const LANGS: Lang[] = ['en', 'ua', 'pt'];

// English is the default and the fallback for any missing key.
const DICTIONARIES: Record<Lang, unknown> = { en, ua, pt };
const STORAGE_KEY = 'lang';

type Params = Record<string, string | number>;

function resolve(dict: unknown, path: string): string | undefined {
  let node: unknown = dict;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (node && typeof node === 'object' && parts[i] in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[parts[i]];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'uk') return 'ua'; // migrate the pre-rename stored value
  return stored === 'ua' || stored === 'pt' || stored === 'en' ? stored : 'en';
}

/** Active language (persisted in localStorage) + the `t(key, params)`
 * translator with English fallback for missing keys. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Keeps <html lang> in sync with the active language on every change AND
  // on the initial mount - a fresh load must not sit under the static
  // index.html default once the real (possibly stored) language is known.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Params): string => {
      // Current language, then English fallback, then the key itself.
      const value = resolve(DICTIONARIES[lang], key) ?? resolve(DICTIONARIES.en, key) ?? key;
      return interpolate(value, params);
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translator + language state. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
