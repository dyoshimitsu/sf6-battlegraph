import { useEffect, useMemo, useState } from "react";
import { type Locale, type TranslationKey, translations } from "./translations";

const STORAGE_KEY = "sf6-battlegraph.locale";

function initialLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "ja" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function useI18n() {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return useMemo(() => {
    const dictionary = translations[locale];
    return {
      locale,
      setLocale,
      t(key: TranslationKey, variables?: Record<string, string | number>) {
        let value: string = dictionary[key];
        for (const [name, replacement] of Object.entries(variables ?? {})) {
          value = value.replace(`{${name}}`, String(replacement));
        }
        return value;
      },
    };
  }, [locale]);
}
