import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { BONK_LABEL, GAME_NAME } from "@shared/config";
import { en, type MessageKey } from "./locales/en";
import { pt } from "./locales/pt-BR";
import { readLocale, writeLocale, type UiLocale } from "./lib/storage";

const tables: Record<UiLocale, Record<MessageKey, string>> = { "pt-BR": pt, en };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

interface I18nValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(readLocale);
  const value = useMemo<I18nValue>(() => {
    const setLocale = (next: UiLocale) => {
      writeLocale(next);
      setLocaleState(next);
      document.documentElement.lang = next;
    };
    return {
      locale,
      setLocale,
      t: (key, vars = {}) => fill(tables[locale][key] ?? key, { game: GAME_NAME, bonk: BONK_LABEL, ...vars }),
    };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("i18n missing");
  return value;
}
