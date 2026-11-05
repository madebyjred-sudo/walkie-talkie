import type { ReactNode } from 'react'
import { Collapse, Prompt, Caret, Stage, Window, type Act, ACENTO } from './ss'
import './marco.css'
import './terminal.css'

// Every scene on the page is a harness at work: a terminal in the page's one
// frame (550 × 440, window off the right and bottom edges), mid-session, never
// empty. The history is on screen when it starts; a command is typed at the
// bottom and its lines push the history up one at a time, the way a terminal
// scrolls. A satellite card lands on the terminal's empty right side with the
// one thing to take away, and changes with the lines. It holds, then the feed
// dips out and back in at the start. Poster: the finished run.
// (From Sightline's auditar scene, which came from Stageshow's hero-demo.)

export type Linea = { k: 'ok' | 'dim' | 'out' | 'cmd' | 'luz'; a: string; b?: string; soloAncho?: boolean; marca?: string }
export type S = { cmd: string; run: boolean; lines: number; card: boolean; dip: boolean }

type Props = {
  clase: string
  titulo: string
  ruta: string
  historia: () => Linea[]
  comando: () => string
  lineas: () => Linea[]
  /** The card, drawn from how many lines are in: n is the count, final the poster */
  tarjeta: (n: number, total: number) => ReactNode
  oscuro?: boolean
  /** Where the card comes in: after this many lines (default: all of them) */
  tarjetaTras?: number
  /** A running process (a log being followed): no prompt, the lines just arrive */
  sinComando?: boolean
  /** The card over the top of the terminal (where the old history fades),
   * for scenes whose new lines run the terminal's full width */
  tarjetaArriba?: boolean
}

function Row({ l, ruta }: { l: Linea; ruta: string }) {
  if (l.k === 'cmd') return <Prompt path={ruta}>{l.a}</Prompt>
  return (
    <div className="ss-term__line ter-line" data-k={l.k} data-bien={l.marca === '✓' || undefined}>
      <span className={l.k === 'ok' || l.k === 'luz' ? 'ok ter-tick' : 'dim ter-tick'}>{l.marca ?? (l.k === 'ok' ? '✓' : l.k === 'luz' ? '!' : l.k === 'dim' ? '·' : '')}</span>
      <span className="ter-a">{l.a}</span>
      {l.b && <span className={l.k === 'dim' ? 'dim ter-b' : 'ter-b'}>{l.b}</span>}
    </div>
  )
}

export default function Terminal({ clase, titulo, ruta, historia, comando, lineas, tarjeta, oscuro, tarjetaTras, sinComando, tarjetaArriba }: Props) {
  const total = lineas().length
  const tras = tarjetaTras ?? total
  const initial: S = { cmd: '', run: false, lines: 0, card: false, dip: false }
  const poster: S = { cmd: comando(), run: true, lines: total, card: true, dip: false }

  async function script(a: Act<S>) {
    await a.wait(500)
    if (!sinComando) {
      a.mark('type')
      await a.type('cmd', comando())
      await a.wait(250)
      await a.key('enter')
    }
    await a.set({ run: true })
    await a.wait(400)
    a.mark('lines')
    for (let i = 1; i <= total; i++) {
      await a.set({ lines: i, ...(i >= tras ? { card: true } : {}) })
      await a.wait(i === tras ? 700 : 420)
    }
    a.mark('hold')
    await a.wait(3200)
    a.mark('reset')
    // The seam: the lines close and the card leaves in the open, and only the
    // command's own text is swapped behind the dip. Dipping the whole feed
    // left the pane empty for a third of a second, twice a loop.
    await a.set({ card: false, lines: 0 })
    await a.wait(420)
    await a.set({ dip: true })
    await a.wait(300)
    await a.snap({ cmd: '' })
    await a.set({ dip: false })
    await a.wait(400)
  }

  return (
    <Stage<S>
      width={550}
      height={440}
      compact={{ below: 500, width: 400, height: 340 }}
      initial={initial}
      poster={poster}
      script={script}
      accent={ACENTO}
      keys={{ wide: 'bottom-left', compact: 'top' }}
      className={`marco ter ${clase}${oscuro ? ' oscuro' : ''}`}
    >
      {(s, _rect, layout) => {
        const wide = layout === 'wide'
        const keep = (l: Linea) => wide || !l.soloAncho
        const shown = lineas().filter(keep)
        const count = lineas().slice(0, s.lines).filter(keep).length
        return (
          <>
            <Window chrome="terminal" title={titulo} className="marco-win ter-term">
              {/* Lines leaving at the top fade out: the crop is the fade */}
              <div className="ter-body" data-crop="">
                <div className="ter-feed">
                  {historia().filter(keep).map((l, i) => (
                    <Row key={`h-${i}`} l={l} ruta={ruta} />
                  ))}
                  <div className="ter-corrida" data-dip={s.dip || undefined}>
                    {!sinComando && (
                      // The live line is drawn here rather than with the kit's
                      // Prompt: the command grows a character at a time, which
                      // is the typing and not a jump, and the caret keeps its
                      // box once the command is sent so the line does not hop.
                      // The step is named twice on purpose: data-typing for the
                      // scan that watches steps, data-snap for the one that
                      // watches what settles, which only reads data-snap. The
                      // first character lands half a second after the seam's
                      // dip, and that scan would call the character a hop.
                      <div className="ss-term__line ss-term__prompt">
                        <span className="ss-term__path">{ruta}</span>
                        <span className="ss-term__sigil">❯</span>
                        <span className="ss-term__cmd" data-typing="" data-snap="" data-run={s.run || undefined}>
                          {s.cmd}
                          <Caret still={s.cmd.length > 0 && s.cmd.length < comando().length} />
                        </span>
                      </div>
                    )}
                    {shown.map((l, i) => (
                      <Collapse key={`n-${i}-${l.a}`} open={count > i}>
                        <Row l={l} ruta={ruta} />
                      </Collapse>
                    ))}
                  </div>
                </div>
              </div>
            </Window>
            <div className="marco-sat ter-card" data-arriba={tarjetaArriba || undefined} data-show={s.card || undefined}>
              {tarjeta(s.lines, total)}
            </div>
          </>
        )
      }}
    </Stage>
  )
}

/** The card's usual shape: a head with a name and a tag, a big value, a foot. */
export function Tarjeta({ nombre, etiqueta, valor, pie }: { nombre: string; etiqueta?: string; valor: ReactNode; pie?: ReactNode }) {
  return (
    <>
      <div className="ter-card__head">
        <span className="ter-card__app">{nombre}</span>
        {etiqueta && <span className="ter-card__tag">{etiqueta}</span>}
      </div>
      <div className="ter-card__valor">{valor}</div>
      {pie && <div className="ter-card__foot">{pie}</div>}
    </>
  )
}
