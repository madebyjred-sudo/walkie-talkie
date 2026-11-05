// El verificador: revisa el commit o el deploy que el otro dice que hizo. Todo de solo lectura:
// el commit se baja a un worktree aparte, los comandos salen de TU configuración (nunca de un mensaje)
// y corren sin red hacia afuera, sin tus llaves y sin poder escribir fuera del worktree.
// Veredicto: la rama sale de una punta reciente, solo toca lo permitido, los comandos pasan,
// la prueba nueva pasa con el arreglo y falla sin él.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buscar, leerConfig } from './config.mjs';

const REF = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;
const RUTA = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,300}$/;
const PRUEBAS = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec|e2e)\.[cm]?[jt]sx?$/;
const OMITIDA = /\bOMITID[AO]S?\b|ℹ skipped [1-9]|# skip [1-9]|ℹ tests 0\b/;

const sh = (repo, args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
const glob = (g) => new RegExp('^' + g.split('**').map((p) => p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
const corto = (s) => s.slice(0, 7);

function perfil(wt, tmp, red, privados = []) {
  const h = realpathSync(homedir());
  // privados: rutas tuyas de más (relativas a tu casa) que lo de adentro tampoco puede leer.
  const secretos = ['.ssh', '.aws', '.gnupg', '.config/gh', '.docker', '.kube', '.npmrc', '.netrc', 'Library/Keychains', ...privados];
  return `(version 1)
(allow default)
${red === 'abierta' ? '' : `(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))
(allow network-outbound (remote unix-socket))`}
(deny file-write* (require-not (require-any (subpath "${wt}") (subpath "${tmp}") (subpath "/dev") (subpath "/private/var/folders") (subpath "/private/tmp"))))
(deny file-read* ${secretos.map((s) => `(subpath "${h}/${s}")`).join(' ')} (regex #"/\\.walkie/"))
`;
}

// Corre un comando del dueño dentro del worktree, aislado. Devuelve { codigo, salida, aislado }.
export function correr(cmd, wt, tmp, conf) {
  const env = { PATH: process.env.PATH, USER: process.env.USER, LOGNAME: process.env.LOGNAME, HOME: join(tmp, 'home'), TMPDIR: tmp, LANG: 'en_US.UTF-8', CI: '1', ...(conf.entorno || {}) };
  // entornoDe: { archivo, claves }: solo esas claves de un .env TUYO (p. ej. la base de pruebas local).
  if (conf.entornoDe?.archivo && existsSync(conf.entornoDe.archivo)) {
    for (const l of readFileSync(conf.entornoDe.archivo, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
      if (m && (conf.entornoDe.claves || []).includes(m[1])) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  mkdirSync(env.HOME, { recursive: true });
  let prog = 'sh', args = ['-c', cmd], aislado = 'sin aislar (este sistema no tiene sandbox-exec ni unshare)';
  if (process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
    const p = join(tmp, 'perfil.sb');
    writeFileSync(p, perfil(realpathSync(wt), realpathSync(tmp), conf.red, conf.privados));
    prog = '/usr/bin/sandbox-exec'; args = ['-f', p, 'sh', '-c', cmd];
    aislado = `${conf.red === 'abierta' ? 'con red abierta (lo pide tu config para este repo)' : 'sin red hacia afuera'}, sin tus llaves, escritura solo en el worktree`;
  } else if (conf.red !== 'abierta' && spawnSync('unshare', ['-rn', 'true']).status === 0) {
    prog = 'unshare'; args = ['-rn', 'sh', '-c', cmd]; aislado = 'sin red';
  }
  const r = spawnSync(prog, args, { cwd: wt, env, encoding: 'utf8', timeout: (conf.techo || 600) * 1000, maxBuffer: 32 * 1024 * 1024 });
  return { codigo: r.error ? r.error.code : r.status, salida: `${r.stdout || ''}${r.stderr || ''}`, aislado };
}

const conteo = (s) => {
  // Los ejecutores caseros imprimen «ok …» / «FAIL …» por caso: valen más que el «1 archivo» de node --test.
  const ok = (s.match(/^\s*ok\s/gm) || []).length, mal = (s.match(/^\s*FAIL\s/gm) || []).length;
  if (ok + mal > 1) return `${ok} ok, ${mal} fallos`;
  const p = /ℹ pass (\d+)/.exec(s), f = /ℹ fail (\d+)/.exec(s);
  return p ? `${p[1]} ok, ${f?.[1] ?? 0} fallos` : (s.trim().split('\n').filter(Boolean).pop() || '').slice(0, 120);
};

export async function verificar(flags) {
  const w = buscar();
  const conf = (w && leerConfig(w).verificar?.[flags.repo]) || null;
  if (!conf) return { ok: false, texto: `No hay un repo «${flags.repo}» en la sección verificar de tu .walkie/config.json. Lo agrega tu dueño, nunca un mensaje.` };
  const repo = conf.ruta, rama = String(flags.rama || '');
  if (!REF.test(rama)) return { ok: false, texto: `Rama inválida: ${rama}` };
  const base = String(flags.base || conf.base || 'origin/main');
  if (!REF.test(base)) return { ok: false, texto: `Base inválida: ${base}` };
  const pruebasPedidas = [].concat(flags.prueba || []).map(String);
  if (pruebasPedidas.some((p) => !RUTA.test(p))) return { ok: false, texto: 'Ruta de prueba inválida.' };
  if (!flags['sin-traer']) try { sh(repo, ['fetch', '-q', 'origin']); } catch {}

  let sha;
  for (const r of [`origin/${rama}`, rama]) { try { sha = sh(repo, ['rev-parse', '--verify', '-q', `${r}^{commit}`]); break; } catch {} }
  if (!sha) return { ok: false, texto: `No encuentro ${rama} en ${repo}.` };
  const mb = sh(repo, ['merge-base', sha, base]);
  const detras = Number(sh(repo, ['rev-list', '--count', `${mb}..${base}`]));
  const recencia = Number(conf.recencia ?? 50);
  const archivos = sh(repo, ['diff', '--name-only', mb, sha]).split('\n').filter(Boolean);
  const permitido = [].concat(flags.permitido || conf.permitido || ['**']).map(String).map(glob);
  const fuera = archivos.filter((f) => !permitido.some((g) => g.test(f)));
  const pruebas = pruebasPedidas.length ? pruebasPedidas : archivos.filter((f) => PRUEBAS.test(f));
  const arreglo = archivos.filter((f) => !pruebas.includes(f) && !PRUEBAS.test(f));

  const l = [], fallas = [];
  l.push(`sale de ${corto(mb)}, ${detras} commits detrás de ${base}${detras > recencia ? ` (más de ${recencia})` : ''}`);
  if (detras > recencia) fallas.push('la rama no sale de una punta reciente');
  l.push(`toca ${archivos.length} archivos: ${archivos.join(', ') || '(ninguno)'}${fuera.length ? `; fuera de lo permitido: ${fuera.join(', ')}` : ''}`);
  if (fuera.length) fallas.push(`toca archivos fuera del contrato (${fuera.join(', ')})`);
  if (!archivos.length) fallas.push('la rama no trae cambios sobre la base');

  const tmp = realpathSync(mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'walkie-verificar-')));
  const wt = join(tmp, 'wt');
  let aislado = '';
  try {
    sh(repo, ['worktree', 'add', '-q', '--detach', wt, sha]);
    for (const r of conf.reusar || []) if (existsSync(join(repo, r)) && !existsSync(join(wt, r))) { mkdirSync(dirname(join(wt, r)), { recursive: true }); symlinkSync(join(repo, r), join(wt, r)); }
    for (const c of conf.comandos || []) {
      const r = correr(c, wt, tmp, conf); aislado = r.aislado;
      l.push(`${c}: ${r.codigo === 0 ? 'pasa' : `falla (${r.codigo})\n` + r.salida.trim().split('\n').slice(-12).map((x) => '    ' + x.slice(0, 200)).join('\n')}`);
      if (r.codigo !== 0) fallas.push(`${c} no pasa`);
    }
    if (!pruebas.length) fallas.push('no trae una prueba nueva');
    else if (conf.prueba) {
      // prueba: una plantilla, o una por carpeta ({ "backend/": "cd backend && … {pruebas}", "": "node --test {pruebas}" }).
      const plantillas = typeof conf.prueba === 'string' ? { '': conf.prueba } : conf.prueba;
      const prefijos = Object.keys(plantillas).sort((a, b) => b.length - a.length);
      const grupos = {};
      for (const p of pruebas) { const k = prefijos.find((x) => p.startsWith(x)); if (k !== undefined) (grupos[k] ||= []).push(p.slice(k.length)); }
      const tanda = () => Object.entries(grupos).map(([k, ps]) => correr(plantillas[k].replace('{pruebas}', ps.join(' ')), wt, tmp, conf));
      const resumen = (rs) => rs.map((r) => conteo(r.salida)).join(' + ');
      const cola = (rs) => rs.filter((r) => r.codigo !== 0).map((r) => r.salida.trim().split('\n').slice(-12).map((x) => '    ' + x.slice(0, 200)).join('\n')).join('\n');
      const con = tanda(); aislado = con[0]?.aislado || aislado;
      const omitida = con.some((r) => OMITIDA.test(r.salida));
      const pasa = con.every((r) => r.codigo === 0);
      l.push(`la prueba (${pruebas.join(', ')}) con el arreglo: ${omitida ? 'no corrió (se omitió)' : pasa ? 'pasa' : 'falla'} · ${resumen(con)}`);
      if (omitida) fallas.push('la prueba se omitió: no corrió de verdad');
      else if (!pasa) { fallas.push('la prueba nueva no pasa con el arreglo'); l.push(cola(con)); }
      if (arreglo.length && !omitida) {
        for (const f of arreglo) {
          try { sh(wt, ['checkout', mb, '--', f]); } catch { rmSync(join(wt, f), { force: true }); }
        }
        const sin = tanda();
        const om2 = sin.some((r) => OMITIDA.test(r.salida));
        const pasaSin = sin.every((r) => r.codigo === 0);
        l.push(`sin el arreglo (${arreglo.join(', ')} como en ${corto(mb)}): ${om2 ? 'no corrió (se omitió)' : pasaSin ? 'pasa' : 'falla'} · ${resumen(sin)}`);
        if (om2) fallas.push('sin el arreglo la prueba se omitió');
        else if (pasaSin) fallas.push('la prueba pasa también sin el arreglo: no prueba el arreglo');
      } else if (!arreglo.length) fallas.push('solo cambian pruebas; no hay arreglo que probar');
    }
  } finally {
    try { sh(repo, ['worktree', 'remove', '--force', wt]); } catch {}
    try { sh(repo, ['worktree', 'prune']); } catch {}
    rmSync(tmp, { recursive: true, force: true });
  }
  const ok = fallas.length === 0;
  const texto = [`${ok ? 'Verificada' : 'No verificada'} · ${rama} (${corto(sha)})`, ...(ok ? [] : [`Falta: ${fallas.join('; ')}.`]), ...l.map((x) => `- ${x}`), `Corrido en un worktree aparte${aislado ? `, ${aislado}` : ''}.`].join('\n');
  return { ok, texto, fallas, sha, mb, archivos };
}

export async function humo(url, flags = {}) {
  if (!/^https?:\/\/[^\s]+$/.test(url || '')) return { ok: false, texto: `URL inválida: ${url}` };
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(Number(flags.techo || 20) * 1000), headers: { 'user-agent': 'walkie-humo' } });
    const cuerpo = await r.text();
    const busca = [].concat(flags.contiene || []).map(String);
    const faltan = busca.filter((s) => !cuerpo.includes(s));
    const ok = r.ok && !faltan.length;
    return { ok, texto: [`${ok ? 'Responde' : 'No pasa'} · ${url}`, `- ${r.status} en ${Date.now() - t0} ms${r.url !== url ? `, termina en ${r.url}` : ''}`, ...busca.map((s) => `- «${s}»: ${faltan.includes(s) ? 'no está' : 'está'}`)].join('\n') };
  } catch (e) {
    return { ok: false, texto: `No responde · ${url}\n- ${e.cause?.code || e.name}: ${e.message}` };
  }
}
