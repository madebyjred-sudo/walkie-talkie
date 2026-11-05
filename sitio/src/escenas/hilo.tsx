import { Check } from './ss'
import Terminal, { type Linea } from './terminal'
import { t } from '../lang'

// The thread: Rosa's harness listens, finds Teo's «Hecha», verifies the branch
// and answers in the same thread. The card is the thread's state, deduced from
// what was said: assigned, done, verified, each lit as its line comes in.

const historia = (): Linea[] => [
  { k: 'cmd', a: t('¿qué quedó de ayer?', "what's left from yesterday?") },
  { k: 'ok', a: 'hilo', b: '20261103-0912-rosa' },
  { k: 'dim', a: 'teo', b: t('Hecha. Captura del login', 'Done. Login screenshot') },
  { k: 'dim', a: 'rosa', b: t('Verificada.', 'Verified.') },
  { k: 'cmd', a: t('lee el roadmap del canal', "read the channel's roadmap") },
  { k: 'ok', a: 'Read', b: 'canal/roadmap.md' },
  { k: 'dim', a: 'roadmap', b: t('3 frentes abiertos', '3 open fronts') },
  { k: 'cmd', a: t('asígnale a teo la agenda en móvil', 'assign teo the agenda on mobile') },
  { k: 'ok', a: 'hablar', b: t('teo · Tarea: la agenda…', 'teo · Task: the agenda…') },
  { k: 'dim', a: 'hilo', b: '20261104-1318-rosa' },
]

const lineas = (): Linea[] => [
  { k: 'ok', a: 'escuchar', b: t('1 mensaje nuevo', '1 new message') },
  { k: 'dim', a: 'teo', b: t('Hecha. Rama agenda-movil', 'Done. Branch agenda-movil') },
  { k: 'ok', a: 'verificar', b: 'agenda-movil' },
  { k: 'dim', a: 'diff', b: t('2 archivos, permitidos', '2 files, allowed'), soloAncho: true },
  { k: 'ok', a: t('prueba', 'test'), b: t('falla sin el arreglo', 'fails without the fix') },
  { k: 'ok', a: 'hablar', b: t('teo · Verificada.', 'teo · Verified.') },
]

export default function Hilo() {
  const pasos = () => [t('Asignada', 'Assigned'), t('Hecha', 'Done'), t('Verificada', 'Verified')]
  return (
    <Terminal
      clase="hil"
      titulo="rosa · claude"
      ruta="~/crm"
      historia={historia}
      comando={() => t('escucha el canal', 'listen to the channel')}
      lineas={lineas}
      tarjetaTras={1}
      tarjeta={(n, total) => {
        // How far the thread got, read from the lines in: Teo's «Hecha» (2), Rosa's «Verificada» (last)
        const hecho = [true, n >= 2, n >= total]
        return (
          <>
            <div className="ter-card__head">
              <span className="ter-card__app">{t('Hilo', 'Thread')}</span>
            </div>
            <div className="ter-pasos">
              {pasos().map((p, i) => (
                <div key={i} className="ter-paso" data-on={hecho[i] || undefined}>
                  <Check on={hecho[i]} pending={!hecho[i] && hecho[i - 1]} />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </>
        )
      }}
    />
  )
}
