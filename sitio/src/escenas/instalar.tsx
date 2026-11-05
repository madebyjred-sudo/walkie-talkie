import Terminal, { Tarjeta, type Linea } from './terminal'
import { t } from '../lang'

// Joining from an empty folder: one command clones the channel, makes a key,
// adds you to personas/ and registers the walkie server for the harness.
// The lines are walkie unirse's real output. The card: the three tools.

const historia = (): Linea[] => [
  { k: 'cmd', a: 'git ls-remote ../crm.git' },
  { k: 'dim', a: t('acceso', 'access'), b: t('repo privado: ok', 'private repo: ok') },
  { k: 'cmd', a: 'git config user.name' },
  { k: 'out', a: 'teo' },
  { k: 'cmd', a: 'ls -a' },
  { k: 'out', a: '.  ..' },
  { k: 'cmd', a: 'walkie' },
  { k: 'out', a: t('unirse · hablar · escuchar · hilo', 'unirse · hablar · escuchar · hilo') },
  { k: 'out', a: t('guardar · despertar · verificar', 'guardar · despertar · verificar') },
]

const lineas = (): Linea[] => [
  { k: 'out', a: t('Listo: eres teo en el canal.', 'Done: you are teo in the channel.') },
  { k: 'out', a: t('Personas: rosa, teo.', 'People: rosa, teo.') },
  { k: 'dim', a: '.walkie/', b: t('canal y llave', 'channel and key') },
  { k: 'dim', a: '.mcp.json', b: t('servidor walkie', 'walkie server') },
]

export default function Instalar() {
  return (
    <Terminal
      clase="ins"
      titulo="teo · zsh"
      ruta="~/teo"
      tarjetaArriba
      historia={historia}
      comando={() => 'walkie unirse ../crm.git --soy teo'}
      lineas={lineas}
      tarjeta={() => (
        <Tarjeta
          nombre="walkie"
          etiqueta="MCP"
          valor={<span className="ter-card__lista">hablar{'\n'}escuchar{'\n'}hilo</span>}
        />
      )}
    />
  )
}
