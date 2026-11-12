'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { translations, type Locale } from '@/src/locales'

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    let frame = 0
    const updateVisibility = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 300)
        frame = 0
      })
    }
    const updateLocale = () => setLocale(document.documentElement.lang.toLowerCase().startsWith('pl') ? 'pl' : 'en')
    updateVisibility()
    updateLocale()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('app-locale-change', updateLocale)
    return () => {
      window.removeEventListener('scroll', updateVisibility)
      window.removeEventListener('app-locale-change', updateLocale)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <button type="button" aria-label={translations[locale].scrollToTop} aria-hidden={!visible} tabIndex={visible ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} className={`fixed bottom-5 right-5 z-50 grid size-11 place-items-center rounded-full bg-teal-700 text-white shadow-lg transition-opacity duration-200 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <ArrowUp aria-hidden="true" size={18} />
    </button>
  )
}
