// El cliente del relay: la misma cara que el canal git, para que hablar, escuchar e hilo no cambien.
// Usa curl para ser síncrono como git. La llave vive en .walkie/cabecera (0600), nunca en la línea de comandos.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { crear, leer, NOMBRE, TODOS } from './mensaje.mjs';
import { detectar, nombreSecreto } from './secretos.mjs';
import { guardarJson, leerJson } from './config.mjs';
import { ARCHIVOS } from './canal-git.mjs';

const REFERENCIA = /^(https?:\/\/\S+|(rama|commit|pr|tag):\S+|[0-9a-f]{7,40})$/;
const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export class CanalRelay {
  constructor(w, c) {
    this.w = w; this.yo = c.yo; this.url = c.relay.replace(/\/$/, '');
    this.dir = join(w, 'canal');
    for (const d of ['mensajes', 'adjuntos']) mkdirSync(join(this.dir, d), { recursive: true });
  }

  pedir(metodo, ruta, { cuerpo, archivo, cabeceras = [], binario = false } = {}) {
    const args = ['-s', '-S', '-X', metodo, '-H', `@${join(this.w, 'cabecera')}`, '-w', '\n%{http_code}', '--max-time', '60'];
    for (const h of cabeceras) args.push('-H', h);
    if (cuerpo !== undefined) args.push('-H', 'content-type: application/json', '--data-binary', '@-');
    if (archivo) args.push('--data-binary', `@${archivo}`);
    if (binario) { const out = execFileSync('curl', [...args.filter((a) => a !== '-w' && a !== '\n%{http_code}'), '-f', this.url + ruta]); return out; }
    const out = execFileSync('curl', [...args, this.url + ruta], { input: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const i = out.lastIndexOf('\n');
    const codigo = Number(out.slice(i + 1)), texto = out.slice(0, i);
    let o; try { o = JSON.parse(texto); } catch { o = { texto }; }
    return { codigo, o, texto };
  }

  conCandado(fn) {
    const l = join(this.w, 'candado');
    for (let i = 0; ; i++) {
      try { mkdirSync(l); break; } catch { if (i > 600) throw new Error('el canal está ocupado'); dormir(50); }
    }
    try { return fn(); } finally { rmSync(l, { recursive: true, force: true }); }
  }

  traer() {
    const estado = leerJson(join(this.w, 'relay.json'), { desde: 0, orden: {} });
    const r = this.pedir('GET', `/mensajes?desde=${estado.desde}`);
    if (r.codigo !== 200) throw new Error(`el relay respondió ${r.codigo}: ${r.o.error || r.texto}`);
    for (const x of r.o.mensajes) {
      writeFileSync(join(this.dir, 'mensajes', x.id + '.json'), JSON.stringify(x.m, null, 1) + '\n');
      estado.orden[x.id] = x.orden;
      for (const a of x.m.adjuntos) if (a.startsWith('adjuntos/')) {
        const p = resolve(this.dir, a);
        if (relative(this.dir, p).startsWith('..') || existsSync(p)) continue;
        try { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, this.pedir('GET', '/' + a, { binario: true })); } catch {}
      }
    }
    estado.desde = r.o.total;
    for (const f of ARCHIVOS) {
      try { writeFileSync(join(this.dir, f), this.pedir('GET', `/archivos/${f}`, { binario: true })); } catch {}
    }
    guardarJson(join(this.w, 'relay.json'), estado);
  }

  todos() {
    const orden = leerJson(join(this.w, 'relay.json'), { orden: {} }).orden;
    return readdirSync(join(this.dir, 'mensajes')).filter((f) => f.endsWith('.json')).map((f) => {
      const id = f.slice(0, -5);
      const r = leer(id, readFileSync(join(this.dir, 'mensajes', f), 'utf8'));
      // El relay pone el autor según la llave: si llegó por el relay, el autor es quien dice.
      r.firma = 'verificada';
      r.orden = orden[id] ?? Infinity;
      return r;
    }).sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
  }

  adjuntoLeido(a) {
    if (REFERENCIA.test(a)) return a;
    const p = resolve(this.dir, a);
    if (relative(this.dir, p).startsWith('..') || !a.startsWith('adjuntos/')) return `${a} (rechazado: fuera del canal)`;
    if (!existsSync(p)) return `${a} (todavía no llegó)`;
    if (!lstatSync(p).isFile()) return `${a} (rechazado: no es un archivo normal)`;
    return p;
  }

  enviar({ para, hilo, texto, adjuntos = [] }) {
    if (!NOMBRE.test(para || '')) throw new Error('para: escribe el nombre de una persona del canal o «todos»');
    const s = detectar(texto);
    if (s.length) throw new Error(`el mensaje trae un secreto (${s.map((x) => x.tipo).join(', ')}); quítalo y vuelve a hablar`);
    return this.conCandado(() => {
      const { id } = crear({ de: this.yo, para, hilo, texto });
      const lista = [];
      for (const a of adjuntos) {
        if (REFERENCIA.test(a)) { if (detectar(a).length) throw new Error(`el adjunto ${a} trae un secreto`); lista.push(a); continue; }
        const p = resolve(a);
        if (!existsSync(p) || !lstatSync(p).isFile()) throw new Error(`${a} no es un archivo normal`);
        if (nombreSecreto(p)) throw new Error(`${basename(a)} es un archivo de secretos; no se adjunta`);
        const nombre = basename(p).replace(/[^A-Za-z0-9._-]/g, '-');
        const r = this.pedir('PUT', `/adjuntos/${id}/${nombre}`, { archivo: p });
        if (r.codigo !== 201) throw new Error(`no pude subir ${a}: ${r.o.error || r.codigo}`);
        lista.push(r.o.ruta);
      }
      const r = this.pedir('POST', '/mensajes', { cuerpo: { id, m: { para, hilo: hilo || id, texto, adjuntos: lista } } });
      if (r.codigo !== 201) throw new Error(r.o.error || `el relay respondió ${r.codigo}`);
      return { id, m: { de: this.yo, para, hilo: r.o.hilo, texto, adjuntos: lista } };
    });
  }

  guardarArchivos() {
    return this.conCandado(() => {
      const base = leerJson(join(this.w, 'relay-archivos.json'), {});
      const subidos = [];
      for (const f of ARCHIVOS) {
        const p = join(this.dir, f);
        if (!existsSync(p)) continue;
        const remoto = this.pedir('GET', `/archivos/${f}`, { binario: true });
        const local = readFileSync(p);
        if (Buffer.compare(remoto, local) === 0) continue;
        if (detectar(local.toString('utf8')).length) throw new Error(`${f} trae un secreto; quítalo antes de guardar`);
        const etag = execFileSync('shasum', ['-a', '256'], { input: remoto, encoding: 'utf8' }).split(' ')[0];
        const r = this.pedir('PUT', `/archivos/${f}`, { archivo: p, cabeceras: [`if-match: ${etag}`] });
        if (r.codigo !== 200) throw new Error(`${f}: ${r.o.error || r.codigo}`);
        subidos.push(f);
      }
      guardarJson(join(this.w, 'relay-archivos.json'), base);
      return subidos;
    });
  }

  archivosCambiados() {
    const p = join(this.w, 'visto.json');
    const v = leerJson(p, {});
    const r = this.pedir('GET', '/archivos');
    const cambios = (r.o.cambios || []);
    const nuevos = cambios.slice(v.archivos || 0).filter((x) => x.autor !== this.yo);
    guardarJson(p, { ...v, archivos: cambios.length });
    return [...new Map(nuevos.map((x) => [x.archivo, x])).values()];
  }
}
