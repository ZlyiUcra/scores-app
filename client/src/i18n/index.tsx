import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import uk from './uk.json';
import pt from './pt.json';

export type Lang = 'en' | 'uk' | 'pt';

export const LANGS: Lang[] = ['en', 'uk', 'pt'];

// English is the default and the fallback for any missing key.
const DICTIONARIES: Record<Lang, unknown> = { en, uk, pt };
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
  return stored === 'uk' || stored === 'pt' || stored === 'en' ? stored : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
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

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
