import { useEffect, useState } from 'react'
import { t, useIdioma, type Lang } from './lang'
import { cambiarConMorph } from './morph'
import Telon from './telon'
import EnsayoEs, { SECCIONES as SECCIONES_ES } from './ensayo.es'
import EnsayoEn, { SECCIONES as SECCIONES_EN } from './ensayo.en'

// The title in ASCII (figlet, Small Slant), its period in the accent.
const MARCA = [
  '              ____    _       __       ____    _',
  ' _    _____ _/ / /__ (_)__   / /____ _/ / /__ (_)__',
  "| |/|/ / _ `/ /  '_// / -_) / __/ _ `/ /  '_// / -_)",
  '|__,__/\\_,_/_/_/\\_\\/_/\\__/  \\__/\\_,_/_/_/\\_\\/_/\\__',
].join('\n')
// In the index the two words stack, so the mark fits the index's width
const MARCA_CHICA = [
  '              ____    _',
  ' _    _____ _/ / /__ (_)__',
  "| |/|/ / _ `/ /  '_// / -_)",
  '|__,__/\\_,_/_/_/\\_\\/_/\\__/',
  '  __       ____    _',
  ' / /____ _/ / /__ (_)__',
  "/ __/ _ `/ /  '_// / -_)",
  '\\__/\\_,_/_/_/\\_\\/_/\\__',
].join('\n')

const secciones = () => t<readonly (readonly [string, string])[]>(SECCIONES_ES, SECCIONES_EN)

// The other language: its address, its name in itself, its code
const otro = () => t({ href: '/en/', nombre: 'English', lang: 'en' as Lang }, { href: '/', nombre: 'Español', lang: 'es' as Lang })

const DESCRIPCION = {
  es: 'Walkie Talkie conecta tu harness con el de tu socio o tu equipo: se asignan, reportan y verifican trabajo por un canal git privado.',
  en: "Walkie Talkie connects your harness with your partner's or your team's: they assign, report and verify work over a private git channel.",
}

function Indice() {
  const SECCIONES = secciones()
  const [activa, setActiva] = useState<string>('')
  useEffect(() => {
    const els = SECCIONES.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const alto = () => {
      let actual = ''
      for (const el of els) if (el.getBoundingClientRect().top < window.innerHeight * 0.35) actual = el.id
      setActiva(actual)
    }
    alto()
    window.addEventListener('scroll', alto, { passive: true })
    return () => window.removeEventListener('scroll', alto)
  }, [])
  return (
    <nav className="indice" aria-label={t('Secciones', 'Sections')}>
      <a className="indice__arriba" href="#top">
        ↑ {t('Arriba', 'Top')}
      </a>
      <div className="indice__titulo">
        <span className="solo-lectores">Walkie Talkie</span>
        <pre className="marca marca--chica" aria-hidden="true">
          {MARCA_CHICA}
          <b>(_)</b>
        </pre>
      </div>
      <ul>
        {SECCIONES.map(([id, nombre]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={activa === id ? 'true' : undefined}>
              {nombre}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function App() {
  const lang = useIdioma()
  // The page renders after load, so the browser can't find the hash's section
  // on its own; this takes the reader there
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  // Back and forward across the switch change the language the same way
  useEffect(() => {
    const volver = () => cambiarConMorph(window.location.pathname.startsWith('/en') ? 'en' : 'es')
    window.addEventListener('popstate', volver)
    return () => window.removeEventListener('popstate', volver)
  }, [])
  useEffect(() => {
    document.querySelector('meta[name="description"]')?.setAttribute('content', DESCRIPCION[lang])
  }, [lang])
  // A new language mounts the page again, so every scene restarts in it
  return <Pagina key={lang} />
}

function Pagina() {
  const Ensayo = t(EnsayoEs, EnsayoEn)
  const OTRO = otro()
  return (
    <>
      <Indice />
      <main className="ensayo" id="top">
        <header className="cabeza">
          <h1>
            <span className="solo-lectores">Walkie Talkie</span>
            <pre className="marca marca--ancha" aria-hidden="true">
              {MARCA}
              <b>(_)</b>
            </pre>
            {/* A phone column is narrower than the two words in a row: they stack */}
            <pre className="marca marca--apilada" aria-hidden="true">
              {MARCA_CHICA}
              <b>(_)</b>
            </pre>
          </h1>
          <div className="cabeza__linea">
            <time dateTime="2026-11-04">{t('4 de noviembre, 2026', 'November 4, 2026')}</time>
            <a
              href={OTRO.href}
              hrefLang={OTRO.lang}
              lang={OTRO.lang}
              onClick={(e) => {
                e.preventDefault()
                const hash = window.location.hash
                cambiarConMorph(OTRO.lang)
                window.history.pushState(null, '', OTRO.href + hash)
              }}
            >
              {OTRO.nombre}
            </a>
          </div>
        </header>
        <Ensayo />
      </main>
      <Telon />
    </>
  )
}
