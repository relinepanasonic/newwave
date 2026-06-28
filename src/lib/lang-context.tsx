'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import type { Lang } from './i18n'

interface LangContextValue { lang: Lang; setLang: (l: Lang) => void }
const LangContext = createContext<LangContextValue>({ lang: 'id', setLang: () => {} })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('id')

  useEffect(() => {
    const saved = localStorage.getItem('nw_lang') as Lang | null
    if (saved === 'en' || saved === 'id') setLangState(saved)
  }, [])

  function setLang(l: Lang) {
    localStorage.setItem('nw_lang', l)
    setLangState(l)
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue { return useContext(LangContext) }
