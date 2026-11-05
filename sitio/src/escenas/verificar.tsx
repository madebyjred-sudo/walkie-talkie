import Terminal, { Tarjeta, type Linea } from './terminal'
import { t } from '../lang'

// The other side says it's done and attaches the branch. The check runs in a
// separate worktree: a recent base, only allowed files, typecheck and tests,
// and the new test failing without the fix. The card is what goes back to the
// thread.

const historia = (): Linea[] => [
  { k: 'cmd', a: 'walkie hilo 20261028-0700-rosa' },
  { k: 'dim', a: 'rosa', b: t('Tarea D-02 · agenda', 'Task D-02 · agenda') },
  { k: 'dim', a: 'teo', b: t('Hecha. PR 2', 'Done. PR 2') },
  { k: 'dim', a: 'rosa', b: t('No verificada todavía.', 'Not verified yet.') },
  { k: 'cmd', a: 'walkie escuchar' },
  { k: 'out', a: t('1 mensaje nuevo para rosa.', '1 new message for rosa.') },
  { k: 'dim', a: 'teo', b: t('Hecha. Vuelta 2', 'Done. Round 2') },
  { k: 'dim', a: t('adjunto', 'attached'), b: 'rama:D-02' },
]

// The lines follow walkie verificar's real output, shortened to the frame
const lineas = (): Linea[] => [
  { k: 'luz', marca: '✓', a: t('Verificada · D-02 (a1c93f0)', 'Verified · D-02 (a1c93f0)') },
  { k: 'out', a: t('- sale de 7e2d415, 0 commits detrás de main', '- starts at 7e2d415, 0 commits behind main') },
  { k: 'out', a: t('- toca 4 archivos: agenda.ts, agenda.css…', '- touches 4 files: agenda.ts, agenda.css…') },
  { k: 'out', a: t('- npm run typecheck: pasa', '- npm run typecheck: passes') },
  { k: 'out', a: t('- la prueba con el arreglo: pasa · 12 ok', '- the test with the fix: passes · 12 ok') },
  { k: 'out', a: t('- sin el arreglo: falla · 1 ok, 11 fallan', '- without the fix: fails · 1 ok, 11 fail') },
  { k: 'out', a: t('Corrido en un worktree aparte, sin red.', 'Run in a separate worktree, offline.') },
]

export default function Verificar() {
  return (
    <Terminal
      clase="ver"
      titulo="rosa · zsh"
      ruta="~/crm"
      historia={historia}
      comando={() => 'walkie verificar --repo crm --rama D-02'}
      tarjetaArriba
      lineas={lineas}
      tarjeta={() => <Tarjeta nombre={t('Al hilo', 'To the thread')} etiqueta="D-02" valor={<span className="ter-card__palabra">{t('Verificada', 'Verified')}</span>} pie={t('con la prueba', 'with the proof')} />}
    />
  )
}
