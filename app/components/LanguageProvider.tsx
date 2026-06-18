'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Language, TFunction, createT } from '../i18n/translations';

const LANG_KEY = 'language';

type LangContextType = {
  language: Language;
  setLanguage: (l: Language) => void;
  t: TFunction;
};

const LanguageContext = createContext<LangContextType>({
  language: 'pt',
  setLanguage: () => {},
  t: createT('pt'),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt');

  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY) as Language | null;
    if (saved === 'en' || saved === 'pt') {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    localStorage.setItem(LANG_KEY, l);
  };

  const t = createT(language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
