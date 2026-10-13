import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { dictionaries, LANGUAGES, type Lang, type MessageKey } from './locales';

const STORAGE_KEY = 'ajax-lang';

const isLang = (value: unknown): value is Lang => LANGUAGES.some((l) => l.id === value);

const readStored = (): Lang | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLang(saved) ? saved : null;
  } catch {
    return null;
  }
};

/** Looks a message up in `lang`, falling back to English, then to the key itself. {n}-style params are filled in. */
export const translate = (lang: Lang, key: MessageKey, params?: Record<string, string | number>): string => {
  const template = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : template;
};

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (key, params) => translate('en', key, params) });

export const I18nProvider = ({ initial, children }: { initial?: string | null; children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => readStored() ?? (isLang(initial) ? initial : 'en'));

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable: the choice just won't persist locally (it is also saved on the account)
    }
  }, []);

  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => useContext(I18nContext);
