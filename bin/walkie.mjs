#!/usr/bin/env node
// walkie · tu harness habla con el de tu socio o tu equipo.
//   walkie unirse <repo-del-canal> --soy <nombre> [--rol lider|equipo]   entra al canal desde esta carpeta
//   walkie hablar --para <nombre> [--hilo <id>] [--adjunto <archivo|url>]... "texto"
//   walkie escuchar                                    lo nuevo para ti
//   walkie hilo <id>                                   un hilo completo
//   walkie guardar ["nota"]                            sube los cambios de metodo.md, roadmap.md y aprendizajes.md
//   walkie despertar [--plist]                         una vuelta del despertador (despierta al harness solo si llegó algo)
//   walkie verificar --repo <dir> --rama <rama> ...    revisa un commit del otro en un worktree de solo lectura
//   walkie humo <url> [--contiene "texto"]             prueba un deploy desde afuera
//   walkie relay [--puerto 8790]                       servidor chico para equipos sin repo compartido
//   walkie mcp                                         servidor MCP (lo arranca tu harness)
import { readFileSync } from 'node:fs';

const [cmd, ...resto] = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < resto.length; i++) {
  const a = resto[i];
  if (a.startsWith('--')) {
    const k = a.slice(2), v = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true;
    flags[k] = k in flags ? [].concat(flags[k], v) : v;
  } else pos.push(a);
}
const lista = (v) => (v === undefined ? [] : [].concat(v));

async function main() {
  const w = await import('../src/walkie.mjs');
  switch (cmd) {
    case 'unirse': {
      const r = w.unirse(pos[0], flags.soy, flags.carpeta, flags.rol, flags.llave);
      console.log(`Listo: eres ${r.yo} en el canal. Personas: ${r.personas.join(', ')}.\nTu harness ya tiene el servidor walkie en .mcp.json${flags.rol ? ` y la skill walkie-${flags.rol}` : ''} (Claude Code). Para Codex, mira el README.`);
      break;
    }
    case 'hablar': {
      const texto = pos.join(' ') || (process.stdin.isTTY ? '' : readFileSync(0, 'utf8'));
      const r = w.hablar({ para: flags.para, hilo: flags.hilo, texto, adjuntos: lista(flags.adjunto) });
      console.log(`Enviado ${r.id}${r.hilo !== r.id ? ` en el hilo ${r.hilo}` : ''}.`);
      break;
    }
    case 'escuchar': console.log(w.escuchar({ marcar: !flags['sin-marcar'] }).texto); break;
    case 'hilo': console.log(w.hilo({ id: pos[0] })); break;
    case 'guardar': { const r = w.guardar(pos.join(' ')); console.log(r.length ? `Guardado: ${r.join(', ')}.` : 'No hay cambios en los archivos del canal.'); break; }
    case 'mcp': (await import('../src/mcp.mjs')).servir(); break;
    case 'despertar': {
      const d = await import('../src/despertador.mjs');
      if (flags.plist) { console.log(d.plist(process.cwd(), Number(flags.cada) || 300)); break; }
      process.exitCode = d.despertar(flags);
      break;
    }
    case 'verificar': { const r = await (await import('../src/verificador.mjs')).verificar(flags); console.log(r.texto); process.exitCode = r.ok ? 0 : 1; break; }
    case 'humo': { const r = await (await import('../src/verificador.mjs')).humo(pos[0], flags); console.log(r.texto); process.exitCode = r.ok ? 0 : 1; break; }
    case 'relay': (await import('../src/relay.mjs')).servir(flags); break;
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1).filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
      if (cmd && cmd !== 'ayuda') process.exitCode = 2;
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
