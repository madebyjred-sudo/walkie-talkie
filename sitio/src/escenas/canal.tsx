import Terminal, { Tarjeta, type Linea } from './terminal'
import { t } from '../lang'

// The channel is a git repo: one file per message, five fields, and the commit
// that brought it signed by whoever wrote it. The card is the signature check.

const ID = '20261104-131904-teo-0394'

const historia = (): Linea[] => [
  { k: 'cmd', a: 'ls' },
  { k: 'out', a: 'LEEME.md  metodo.md  roadmap.md' },
  { k: 'out', a: 'aprendizajes.md  personas/' },
  { k: 'out', a: 'mensajes/  adjuntos/' },
  { k: 'cmd', a: 'ls personas' },
  { k: 'out', a: 'rosa.pub  teo.pub' },
  { k: 'cmd', a: 'git pull' },
  { k: 'dim', a: 'mensajes/', b: t('1 archivo nuevo', '1 new file') },
]

const lineas = (): Linea[] => [
  { k: 'out', a: '{' },
  { k: 'out', a: '  "de": "teo",' },
  { k: 'out', a: '  "para": "rosa",' },
  { k: 'out', a: '  "hilo": "20261104-131823-rosa-89c3",' },
  { k: 'out', a: t('  "texto": "Hecha. Agregué la sección…",', '  "texto": "Done. I added the section…",') },
  { k: 'out', a: '  "adjuntos": ["rama:main"]' },
  { k: 'out', a: '}' },
  { k: 'cmd', a: "git log -1 --format='%G? %GS'" },
  { k: 'out', a: 'G teo' },
]

export default function Canal() {
  return (
    <Terminal
      clase="can"
      oscuro
      titulo="rosa · .walkie/canal"
      ruta="canal"
      tarjetaArriba
      historia={historia}
      comando={() => `cat mensajes/…${ID.slice(15)}.json`}
      lineas={lineas}
      tarjeta={() => <Tarjeta nombre={t('Firma', 'Signature')} etiqueta="SSH" valor="teo" pie={t('verificada', 'verified')} />}
    />
  )
}
