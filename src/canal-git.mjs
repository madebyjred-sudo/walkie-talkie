// El canal es un repo git privado compartido. Un archivo por mensaje: dos personas que escriben a la vez
// nunca chocan, y el rebase de un push rechazado siempre entra limpio.
// Cada commit va firmado con la llave SSH de su autor; personas/<nombre>.pub dice de quién es cada llave.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { crear, leer, serializar, NOMBRE, TODOS } from './mensaje.mjs';
import { detectar, nombreSecreto } from './secretos.mjs';
import { guardarJson, leerJson } from './config.mjs';

export const ARCHIVOS = ['metodo.md', 'roadmap.md', 'aprendizajes.md'];
const MAX_MENSAJE = 256 * 1024, MAX_ADJUNTO = 25 * 1024 * 1024;
// Ningún hook, ningún fsmonitor y ningún symlink: el canal no puede correr nada en esta máquina.
const SEGURO = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.symlinks=false', '-c', 'protocol.ext.allow=never'];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true', LC_ALL: 'C' };

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const REFERENCIA = /^(https?:\/\/\S+|(rama|commit|pr|tag):\S+|[0-9a-f]{7,40})$/;

export function git(dir, args, input) {
  return execFileSync('git', [...SEGURO, '-C', dir, ...args], { encoding: 'utf8', env: ENV, input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

export class CanalGit {
  constructor(w, yo) {
    this.w = w;
    this.yo = yo;
    this.dir = join(w, 'canal');
  }

  git(args, input) { return git(this.dir, args, input); }

  // Una operación a la vez por carpeta (el servidor MCP y el despertador comparten el clon).
  conCandado(fn) {
    const l = join(this.w, 'candado');
    for (let i = 0; ; i++) {
      try { mkdirSync(l); writeFileSync(join(l, 'pid'), String(process.pid)); break; } catch {
        let pid = 0;
        try { pid = Number(readFileSync(join(l, 'pid'), 'utf8')); } catch {}
        let vivo = false;
        try { process.kill(pid, 0); vivo = true; } catch {}
        if (!vivo && i > 2) rmSync(l, { recursive: true, force: true });
        if (i > 600) throw new Error('el canal está ocupado por otro proceso');
        dormir(50);
      }
    }
    try { return fn(); } finally { rmSync(l, { recursive: true, force: true }); }
  }

  hayRemoto() {
    try { return this.git(['ls-remote', '--heads', 'origin', 'main']).trim() !== ''; } catch { return false; }
  }

  traer() {
    if (!this.hayRemoto()) return;
    try { this.git(['pull', '-q', '--rebase', 'origin', 'main']); } catch (e) {
      try { this.git(['rebase', '--abort']); } catch {}
      throw new Error('no pude traer el canal: ' + String(e.stderr || e.message).trim().split('\n').pop());
    }
  }

  // Empuja con reintento: si otro empujó primero, rebase (sin choques: archivos nuevos) y otra vez.
  publicar() {
    let ultimo;
    for (let i = 0; i < 20; i++) {
      try { this.git(['push', '-q', 'origin', 'HEAD:main']); return; } catch (e) {
        ultimo = String(e.stderr || e.message);
        if (!/rejected|fetch first|non-fast-forward|failed to push|cannot lock ref|incorrect old value/i.test(ultimo)) throw new Error('no pude empujar: ' + ultimo.trim());
        dormir(50 + Math.random() * 250 * (i + 1));
        this.traer();
      }
    }
    throw new Error('no pude empujar después de 20 intentos: ' + ultimo.trim());
  }

  confirmar(mensaje, rutas) {
    this.git(['add', '--', ...rutas]);
    this.git(['commit', '-q', '-m', mensaje, '--', ...rutas]);
  }

  // Llaves: las del canal, salvo que alguien cambie la llave de un nombre ya conocido (se fija la primera).
  llaves() {
    const d = join(this.dir, 'personas');
    const conocidas = leerJson(join(this.w, 'conocidas.json'), {});
    const vigentes = {}, cambiadas = [];
    for (const f of existsSync(d) ? readdirSync(d) : []) {
      const n = f.replace(/\.pub$/, '');
      if (!f.endsWith('.pub') || !NOMBRE.test(n) || !lstatSync(join(d, f)).isFile()) continue;
      const k = readFileSync(join(d, f), 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
      if (!/^ssh-(ed25519|rsa) [A-Za-z0-9+/=]+$/.test(k)) continue;
      if (conocidas[n] && conocidas[n] !== k) { cambiadas.push(n); vigentes[n] = conocidas[n]; continue; }
      conocidas[n] = vigentes[n] = k;
    }
    guardarJson(join(this.w, 'conocidas.json'), conocidas);
    return { vigentes, cambiadas };
  }

  // id → firma: verificada | sin firma | llave desconocida | firmado por otro | modificado después
  firmas() {
    const cache = leerJson(join(this.w, 'firmas.json'), {});
    const { vigentes } = this.llaves();
    const huella = Object.entries(vigentes).map(([n, k]) => `${n} ${k}`).sort().join('\n');
    if (cache.huella !== huella) { cache.huella = huella; cache.commits = {}; }
    const permitidas = join(this.w, 'firmantes');
    writeFileSync(permitidas, Object.entries(vigentes).map(([n, k]) => `${n} namespaces="git" ${k}`).join('\n') + '\n');
    const out = {};
    let log = '';
    try { log = this.git(['log', '--no-renames', '--format=%x00%H', '--name-status', '--', 'mensajes/']); } catch { return out; }
    const porCommit = [];
    for (const bloque of log.split('\0').slice(1)) {
      const [sha, ...lineas] = bloque.trim().split('\n');
      porCommit.push([sha, lineas.filter(Boolean).map((l) => l.split('\t'))]);
    }
    const pendientes = porCommit.map(([s]) => s).filter((s) => !cache.commits[s]);
    for (let i = 0; i < pendientes.length; i += 200) {
      const lote = pendientes.slice(i, i + 200);
      const r = this.git(['-c', `gpg.ssh.allowedSignersFile=${permitidas}`, 'show', '-s', '--format=%H%x09%G?%x09%GS', ...lote]);
      for (const l of r.trim().split('\n')) { const [s, g, p] = l.split('\t'); cache.commits[s] = [g, p || '']; }
    }
    guardarJson(join(this.w, 'firmas.json'), cache);
    // El log va del más nuevo al más viejo: lo último que se ve de un archivo es su creación.
    porCommit.forEach(([sha, cambios], i) => {
      const [g, firmante] = cache.commits[sha] || ['N', ''];
      for (const [st, ruta] of cambios) {
        const id = basename(ruta, '.json');
        // orden: posición del commit que lo creó en la historia (lineal, por el rebase). Es el orden real.
        if (st === 'A') out[id] = { ...(out[id] || {}), g, firmante, orden: porCommit.length - i };
        else out[id] = { ...(out[id] || {}), modificado: true };
      }
    });
    return out;
  }

  todos() {
    const d = join(this.dir, 'mensajes');
    const firmas = this.firmas();
    const xs = [];
    for (const f of existsSync(d) ? readdirSync(d).sort() : []) {
      if (!f.endsWith('.json')) continue;
      const p = join(d, f), id = f.slice(0, -5);
      const st = lstatSync(p);
      if (!st.isFile() || st.size > MAX_MENSAJE) { xs.push({ id, error: 'no es un archivo de mensaje' }); continue; }
      const r = leer(id, readFileSync(p, 'utf8'));
      const s = firmas[id] || {};
      r.firma = s.modificado ? 'modificado después de enviado'
        : s.g === 'G' ? (s.firmante === r.m?.de ? 'verificada' : `firmado por ${s.firmante}, no por ${r.m?.de}`)
        : s.g === 'N' || !s.g ? 'sin firma' : 'llave desconocida';
      r.orden = s.orden ?? Infinity;
      xs.push(r);
    }
    return xs.sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
  }

  // Revisa un adjunto que llega: solo archivos normales dentro del canal; los enlaces y referencias pasan como texto.
  adjuntoLeido(a) {
    if (REFERENCIA.test(a)) return a;
    const p = resolve(this.dir, a);
    if (relative(this.dir, p).startsWith('..') || !a.startsWith('adjuntos/')) return `${a} (rechazado: fuera del canal)`;
    if (!existsSync(p)) return `${a} (todavía no llegó)`;
    const st = lstatSync(p);
    if (!st.isFile()) return `${a} (rechazado: no es un archivo normal)`;
    if (relative(realpathSync(this.dir), realpathSync(p)).startsWith('..')) return `${a} (rechazado: apunta fuera del canal)`;
    if (nombreSecreto(a)) return `${a} (rechazado: nombre de archivo de secretos)`;
    return p;
  }

  // Prepara un adjunto que sale: archivos locales se copian al canal; enlaces y referencias van como texto.
  adjuntoSaliente(id, a) {
    if (REFERENCIA.test(a)) {
      if (detectar(a).length) throw new Error(`el adjunto ${a} trae un secreto`);
      return { ruta: null, texto: a };
    }
    const p = resolve(a);
    if (!existsSync(p)) throw new Error(`no encuentro el archivo ${a}`);
    const st = lstatSync(p);
    if (!st.isFile()) throw new Error(`${a} no es un archivo normal`);
    if (st.size > MAX_ADJUNTO) throw new Error(`${a} pesa más de 25 MB`);
    if (nombreSecreto(p)) throw new Error(`${basename(a)} es un archivo de secretos; no se adjunta`);
    const cab = readFileSync(p).subarray(0, 1024 * 1024);
    if (!cab.includes(0)) {
      const s = detectar(cab.toString('utf8'));
      if (s.length) throw new Error(`${basename(a)} trae un secreto (${s[0].tipo}); no se adjunta`);
    }
    const nombre = basename(p).replace(/[^A-Za-z0-9._-]/g, '-');
    return { ruta: p, texto: `adjuntos/${id}/${nombre}` };
  }

  enviar({ para, hilo, texto, adjuntos = [] }) {
    if (!NOMBRE.test(para || '')) throw new Error('para: escribe el nombre de una persona del canal o «todos»');
    const s = detectar(texto);
    if (s.length) throw new Error(`el mensaje trae un secreto (${s.map((x) => x.tipo).join(', ')}); quítalo y vuelve a hablar`);
    return this.conCandado(() => {
      this.traer();
      if (para !== TODOS && !existsSync(join(this.dir, 'personas', para + '.pub'))) throw new Error(`${para} no está en el canal`);
      if (hilo && !existsSync(join(this.dir, 'mensajes', hilo + '.json'))) throw new Error(`no existe el hilo ${hilo}`);
      const borrador = crear({ de: this.yo, para, hilo, texto, adjuntos: [] });
      const salientes = adjuntos.map((a) => this.adjuntoSaliente(borrador.id, a));
      const { id, m } = { id: borrador.id, m: { ...borrador.m, adjuntos: salientes.map((x) => x.texto) } };
      const rutas = [`mensajes/${id}.json`];
      mkdirSync(join(this.dir, 'mensajes'), { recursive: true });
      for (const x of salientes) if (x.ruta) {
        mkdirSync(join(this.dir, 'adjuntos', id), { recursive: true });
        copyFileSync(x.ruta, join(this.dir, x.texto));
        rutas.push(x.texto);
      }
      writeFileSync(join(this.dir, rutas[0]), serializar(m));
      this.confirmar(`${this.yo} → ${para}`, rutas);
      this.publicar();
      return { id, m };
    });
  }

  guardarArchivos(nota) {
    return this.conCandado(() => {
      const cambiados = this.git(['status', '--porcelain', '--', ...ARCHIVOS]).split('\n').filter((l) => l.trim()).map((l) => l.slice(3));
      if (!cambiados.length) return [];
      for (const f of cambiados) {
        const s = detectar(readFileSync(join(this.dir, f), 'utf8'));
        if (s.length) throw new Error(`${f} trae un secreto (${s[0].tipo}); quítalo antes de guardar`);
      }
      this.confirmar(nota || `${this.yo} actualiza ${cambiados.join(', ')}`, cambiados);
      this.publicar();
      return cambiados;
    });
  }

  // Qué archivos del canal cambió alguien desde la última vez que miré.
  archivosCambiados() {
    const p = join(this.w, 'visto.json');
    const v = leerJson(p, {});
    let head = '';
    try { head = this.git(['rev-parse', 'HEAD']).trim(); } catch { return []; }
    let out = [];
    if (v.head && v.head !== head) {
      try {
        out = this.git(['log', '--format=%x00%an', '--name-only', `${v.head}..${head}`, '--', ...ARCHIVOS]).split('\0').filter((b) => b.trim())
          .map((b) => { const [autor, ...fs] = b.trim().split('\n'); return fs.filter(Boolean).map((f) => ({ archivo: f, autor })); }).flat()
          .filter((x) => x.autor !== this.yo);
        out = [...new Map(out.map((x) => [x.archivo, x])).values()];
      } catch {}
    }
    guardarJson(p, { ...v, head });
    return out;
  }
}
