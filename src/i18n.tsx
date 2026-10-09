import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import english from '../locales/en.json';
import indonesian from '../locales/id.json';

export type Language = 'id' | 'en';
export type MessageKey = keyof typeof english;
const catalogs: Record<Language, Record<MessageKey, string>> = { id: indonesian, en: english };
function initialLanguage(): Language {
  try {
    return localStorage.getItem('evaly-language') === 'en' ? 'en' : 'id';
  } catch {
    return 'id';
  }
}
let activeLanguage: Language = initialLanguage();
export const getLanguage = () => activeLanguage;
export const locale = () => (activeLanguage === 'id' ? 'id-ID' : 'en-US');
export const number = (value: number, digits: number) =>
  new Intl.NumberFormat(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export function t(
  key: MessageKey,
  values: unknown[] = [],
  language: Language = activeLanguage,
): string {
  return catalogs[language][key].replace(/\{(\d+)\}/g, (_, index) =>
    String(values[Number(index)] ?? ''),
  );
}
const templates = Object.entries(english)
  .filter(([key, value]) => key.includes('{0}') && key !== value)
  .map(([key, value]) => ({
    key: key as MessageKey,
    value,
    id: new RegExp(
      '^' +
        key
          .split(/\{\d+\}/)
          .map(escape)
          .join('(.*?)') +
        '$',
      's',
    ),
    en: new RegExp(
      '^' +
        value
          .split(/\{\d+\}/)
          .map(escape)
          .join('(.*?)') +
        '$',
      's',
    ),
  }));
function escape(value: string) {
  return Array.from(value, (c) => ('\\^$.*+?()[]{}|'.includes(c) ? '\\' + c : c)).join('');
}
const reverse = new Map(Object.entries(english).map(([key, value]) => [value, key as MessageKey]));
// Use only for application-owned text; never apply to records, quotes or audit payloads.
export function tx(
  value: string | null | undefined,
  language: Language = activeLanguage,
  markOriginal = false,
): string {
  if (!value) return value || '';
  if (value.startsWith('Original text: '))
    return (language === 'id' ? 'Teks asli: ' : 'Original text: ') + value.slice(15);
  if (value in english) return t(value as MessageKey, [], language);
  const original = reverse.get(value);
  if (original) return t(original, [], language);
  const questionTitle = /^((?:OI|EP|FE|BR|PC)-[0-9]+) · (.+)$/.exec(value);
  if (questionTitle) return questionTitle[1] + ' · ' + tx(questionTitle[2], language);
  for (const entry of templates) {
    const match = entry.id.exec(value) || entry.en.exec(value);
    if (match)
      return t(
        entry.key,
        match.slice(1).map((part) => tx(part, language)),
        language,
      );
  }
  return markOriginal && language === 'en' ? 'Original text: ' + value : value;
}
export const presentText = (value: string | null | undefined) => tx(value, activeLanguage, true);
export function withLanguage(path: string, language = getLanguage()): string {
  const [base, hash] = path.split('#');
  const [pathname, query = ''] = base.split('?');
  const params = new URLSearchParams(query);
  params.set('lang', language);
  return pathname + '?' + params.toString() + (hash ? '#' + hash : '');
}
const LanguageContext = createContext({
  language: activeLanguage,
  setLanguage: (_value: Language) => {},
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState(activeLanguage);
  const setLanguage = (next: Language) => {
    activeLanguage = next;
    try {
      localStorage.setItem('evaly-language', next);
    } catch {
      /* Storage may be unavailable. */
    }
    updateLanguage(next);
  };
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);
