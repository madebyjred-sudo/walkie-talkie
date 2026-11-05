// Las tres cosas que hace un harness con el canal: hablar, escuchar y leer un hilo. Más unirse y guardar.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CanalGit, ARCHIVOS, git } from './canal-git.mjs';
import { CanalRelay } from './canal-relay.mjs';
import { buscar, guardarJson, leerConfig, leerJson } from './config.mjs';
import { AVISO, encuadrar } from './defensa.mjs';
import { NOMBRE, TODOS, fechaDeId } from './mensaje.mjs';

const BIN = resolve(new URL('../bin/walkie.mjs', import.meta.url).pathname);
const PLANTILLAS = {
  'LEEME.md': '# Canal de Walkie Talkie\n\nCada archivo de mensajes/ es un mensaje: { de, para, hilo, texto, adjuntos }.\nmetodo.md, roadmap.md y aprendizajes.md son de los dos: se editan y se versionan aquí.\n',
  'metodo.md': '# Método\n\nCómo trabajamos: qué se reporta, con qué evidencia y cómo se verifica.\n',
  'roadmap.md': '# Roadmap\n',
  'aprendizajes.md': '# Aprendizajes\n',
};

export function abrir(w = buscar()) {
  if (!w || !existsSync(join(w, 'config.json'))) throw new Error('Esta carpeta no está en ningún canal. Únete con: walkie unirse <repo-del-canal> --soy <tu-nombre>');
  const c = leerConfig(w);
  const canal = c.relay ? new CanalRelay(w, c) : new CanalGit(w, c.yo);
  return { w, c, canal };
}

export function unirse(remoto, yo, carpeta = process.cwd(), rol, llaveRelay) {
  if (!NOMBRE.test(yo || '') || yo === TODOS) throw new Error('tu nombre: minúsculas, números y guiones (ej. rosa)');
  const raiz = resolve(carpeta), w = join(raiz, '.walkie');
  if (existsSync(join(w, 'config.json'))) throw new Error(`esta carpeta ya está en un canal (${w})`);
  mkdirSync(w, { recursive: true });
  writeFileSync(join(w, '.gitignore'), '*\n');
  if (/^https?:\/\//.test(remoto)) return unirseRelay(remoto, yo, raiz, w, rol, llaveRelay);
  const llave = join(w, 'llave');
  if (!existsSync(llave)) execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', `${yo}@walkie`, '-f', llave]);
  const pub = readFileSync(llave + '.pub', 'utf8').trim();
  const dir = join(w, 'canal');
  execFileSync('git', ['-c', 'core.symlinks=false', '-c', 'core.hooksPath=/dev/null', 'clone', '-q', remoto, dir], { stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  for (const [k, v] of [['user.name', yo], ['user.email', `${yo}@walkie`], ['gpg.format', 'ssh'], ['user.signingkey', llave], ['commit.gpgsign', 'true'], ['core.symlinks', 'false'], ['pull.rebase', 'true'], ['init.defaultBranch', 'main']]) git(dir, ['config', k, v]);
  const canal = new CanalGit(w, yo);
  canal.conCandado(() => {
    try { git(dir, ['rev-parse', '--verify', '-q', 'HEAD']); } catch { git(dir, ['checkout', '-q', '-b', 'main']); }
    const rutas = [];
    for (const [f, t] of Object.entries(PLANTILLAS)) if (!existsSync(join(dir, f))) { writeFileSync(join(dir, f), t); rutas.push(f); }
    for (const d of ['mensajes', 'adjuntos', 'personas']) if (!existsSync(join(dir, d, '.gitkeep'))) { mkdirSync(join(dir, d), { recursive: true }); writeFileSync(join(dir, d, '.gitkeep'), ''); rutas.push(`${d}/.gitkeep`); }
    const pp = join(dir, 'personas', yo + '.pub');
    if (existsSync(pp) && readFileSync(pp, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ') !== pub.split(/\s+/).slice(0, 2).join(' ')) {
      throw new Error(`ya hay alguien llamado ${yo} en el canal; elige otro nombre`);
    }
    writeFileSync(pp, pub + '\n');
    rutas.push(`personas/${yo}.pub`);
    canal.confirmar(`${yo} se une al canal`, rutas);
    canal.publicar();
  });
  guardarJson(join(w, 'config.json'), { yo, remoto });
  canal.llaves();
  canal.archivosCambiados();
  registrarMcp(raiz, w);
  if (rol) instalarSkill(raiz, rol);
  return { w, yo, personas: personas(dir) };
}

// Relay: la llave te la da quien opera el relay. Se guarda como cabecera, con permisos 0600.
function unirseRelay(url, yo, raiz, w, rol, llave) {
  if (!llave) throw new Error('para un relay hace falta --llave (te la da quien lo opera)');
  writeFileSync(join(w, 'cabecera'), `authorization: Bearer ${llave}\n`, { mode: 0o600 });
  guardarJson(join(w, 'config.json'), { yo, relay: url });
  const canal = new CanalRelay(w, { yo, relay: url });
  const r = canal.pedir('GET', '/personas');
  if (r.codigo !== 200 || r.o.yo !== yo) throw new Error(r.codigo === 401 ? 'el relay no reconoce esa llave' : `esa llave es de ${r.o.yo}, no de ${yo}`);
  canal.traer();
  canal.archivosCambiados();
  registrarMcp(raiz, w);
  if (rol) instalarSkill(raiz, rol);
  return { w, yo, personas: r.o.personas };
}

// La skill de tu lado, en la carpeta del proyecto (Claude Code la lee de .claude/skills/).
export function instalarSkill(raiz, rol) {
  if (!['lider', 'equipo'].includes(rol)) throw new Error('rol: lider o equipo');
  const origen = resolve(new URL(`../skills/walkie-${rol}/SKILL.md`, import.meta.url).pathname);
  const d = join(raiz, '.claude', 'skills', `walkie-${rol}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'SKILL.md'), readFileSync(origen));
  return d;
}

export function personas(dir) {
  const d = join(dir, 'personas');
  return existsSync(d) ? execFileSync('ls', [d], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.pub')).map((f) => f.slice(0, -4)) : [];
}

// Claude Code lee .mcp.json de la carpeta del proyecto. Se suma sin pisar lo que ya haya.
export function registrarMcp(raiz, w) {
  const p = join(raiz, '.mcp.json');
  const o = leerJson(p, {});
  o.mcpServers = { ...(o.mcpServers || {}), walkie: { command: process.execPath, args: [BIN, 'mcp'], env: { WALKIE_DIR: w } } };
  writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

const hora = (id) => fechaDeId(id)?.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? '';

function presentar(canal, r) {
  if (r.error && !r.m) return `<mensaje id="${r.id}" alertas="no se pudo leer: ${r.error}"></mensaje>`;
  const alertas = [];
  if (r.error) alertas.push(r.error);
  if (r.firma !== 'verificada') alertas.push(`firma: ${r.firma}`);
  if (r.ignorados?.length) alertas.push(`traía campos que no existen (${r.ignorados.join(', ')}); los ignoré`);
  const adjuntos = r.m.adjuntos.map((a) => canal.adjuntoLeido(a));
  return encuadrar(r.m, { id: r.id, hora: hora(r.id), firma: r.firma, alertas, adjuntos });
}

export function hablar({ para, texto, hilo, adjuntos }, w) {
  const { canal } = abrir(w);
  const { id, m } = canal.enviar({ para, texto, hilo, adjuntos });
  return { id, hilo: m.hilo, adjuntos: m.adjuntos };
}

// Lo nuevo para mí. Marca como leído lo que devuelve (salvo marcar: false).
// De a tandas: lo que no cabe se queda sin leer para la próxima vuelta.
export function escuchar({ marcar = true, limite = 30 } = {}, w) {
  const { w: dir, c, canal } = abrir(w);
  return canal.conCandado(() => {
    canal.traer();
    const leidos = new Set(leerJson(join(dir, 'leidos.json'), []));
    const todos = canal.todos().filter((r) => !leidos.has(r.id) && (!r.m || (r.m.de !== c.yo && (r.m.para === c.yo || r.m.para === TODOS))));
    const nuevos = todos.slice(0, limite), quedan = todos.length - nuevos.length;
    const cambios = marcar ? canal.archivosCambiados() : [];
    if (marcar && nuevos.length) guardarJson(join(dir, 'leidos.json'), [...leidos, ...nuevos.map((r) => r.id)]);
    return { yo: c.yo, nuevos, quedan, cambios, texto: textoEscucha(canal, c, nuevos, cambios, quedan) };
  });
}

function textoEscucha(canal, c, nuevos, cambios, quedan) {
  const l = [];
  if (cambios.length) l.push('Cambió en el canal: ' + cambios.map((x) => `${x.archivo} (${x.autor})`).join(', ') + `. Están en ${canal.dir}.`);
  if (!nuevos.length) { l.push(`Nada nuevo para ${c.yo}.`); return l.join('\n\n'); }
  l.push(`${nuevos.length} ${nuevos.length === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} para ${c.yo}.${quedan ? ` Quedan ${quedan} sin leer: vuelve a escuchar.` : ''}`, AVISO);
  for (const r of nuevos) l.push(presentar(canal, r));
  return l.join('\n\n');
}

export function hilo({ id }, w) {
  const { canal } = abrir(w);
  return canal.conCandado(() => {
    canal.traer();
    const xs = canal.todos();
    const raiz = xs.find((r) => r.id === id)?.m?.hilo || id;
    const del = xs.filter((r) => r.m && (r.m.hilo === raiz || r.id === raiz));
    if (!del.length) return `No existe el hilo ${id}.`;
    return [`Hilo ${raiz} · ${del.length} ${del.length === 1 ? 'mensaje' : 'mensajes'}.`, AVISO, ...del.map((r) => presentar(canal, r))].join('\n\n');
  });
}

export function guardar(nota, w) {
  const { canal } = abrir(w);
  return canal.guardarArchivos(nota);
}

export { ARCHIVOS };
