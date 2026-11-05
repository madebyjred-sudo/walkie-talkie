import { Count } from './ss'
import Terminal, { Tarjeta, type Linea } from './terminal'
import { t } from '../lang'

// The alarm looks at the channel every five minutes. Nothing new: one line,
// no model. Something new: it wakes the harness once. The lines are the real
// log; the card counts the model calls of the day, 0 until the message lands.

const historia = (): Linea[] => [
  { k: 'cmd', a: 'cat .walkie/config.json' },
  { k: 'out', a: '{ "yo": "rosa", "despertador": {' },
  { k: 'out', a: '  "modelo": "sonnet", "techo": 1800 } }' },
  { k: 'cmd', a: 'crontab -l' },
  { k: 'out', a: '*/5 * * * * walkie despertar' },
  { k: 'cmd', a: 'tail -f .walkie/despertador/corridas.log' },
  { k: 'dim', a: '07:30', b: t('sin cambios', 'no changes') },
  { k: 'dim', a: '07:35', b: t('sin cambios', 'no changes') },
  { k: 'dim', a: '07:40', b: t('sin cambios', 'no changes') },
  { k: 'dim', a: '07:45', b: t('sin cambios', 'no changes') },
]

const lineas = (): Linea[] => [
  { k: 'dim', a: '07:50', b: t('sin cambios', 'no changes') },
  { k: 'dim', a: '07:55', b: t('sin cambios', 'no changes') },
  { k: 'dim', a: '08:00', b: t('sin cambios', 'no changes') },
  { k: 'ok', a: '08:05', b: t('1 nuevo de teo', '1 new from teo') },
  { k: 'ok', a: '08:06', b: t('entregado', 'delivered') },
]

export default function Despertador() {
  return (
    <Terminal
      clase="des"
      oscuro
      titulo="rosa · despertador"
      ruta="~/crm"
      historia={historia}
      comando={() => ''}
      sinComando
      lineas={lineas}
      tarjetaTras={1}
      tarjeta={(n, total) => (
        <Tarjeta
          nombre={t('Modelo', 'Model')}
          etiqueta={t('hoy', 'today')}
          valor={<Count value={n >= total - 1 ? 1 : 0} duration={500} />}
          pie={t('llamadas', 'calls')}
        />
      )}
    />
  )
}
