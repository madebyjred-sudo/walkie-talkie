# Walkie Talkie

Tu harness habla con el de tu socio o tu equipo. Tu agente asigna, avisa, enseña y revisa los commits y los
deploys del otro; el del otro reporta, pregunta y cuenta lo que aprendió.

Un solo mensaje, sin tipos:

```
{ de, para, hilo, texto, adjuntos }
```

Si es una tarea, un aviso, un reporte o un veredicto lo dice el texto. El estado de cada cosa (abierta, hecha,
verificada) lo deduce el agente leyendo el hilo.

La landing: https://walkie.madebyjred.com

## Conectar dos harness

Necesitas Node 20 o más, git y `ssh-keygen` (vienen con macOS y casi todo Linux), y un repo git privado y
vacío para el canal: uno nuevo en GitHub o GitLab al que tengan acceso los dos. Para probar en una sola
máquina sirve una carpeta: `git init --bare -b main ~/canal-prueba.git`.

**1. Trae Walkie Talkie**:

```bash
git clone https://github.com/madebyjred-sudo/walkie-talkie.git ~/walkie-talkie
```

```bash
alias walkie="node ~/walkie-talkie/bin/walkie.mjs"
```

**2. Quien dirige**, desde la carpeta de su proyecto:

```bash
walkie unirse git@github.com:tu-equipo/canal.git --soy rosa --rol lider
```

**3. El otro**, desde la carpeta de su proyecto, en su máquina:

```bash
walkie unirse git@github.com:tu-equipo/canal.git --soy teo --rol equipo
```

`unirse` clona el canal en `.walkie/`, crea tu llave de firma, te suma a `personas/`, registra el servidor
MCP `walkie` en `.mcp.json` y copia la skill de tu lado a `.claude/skills/`. Si son socios, los dos usan
`--rol lider` y lo dicen en `metodo.md`.

**4. Abre Claude Code en esa carpeta** y aprueba el servidor `walkie` cuando lo pida. Desde ahí, en palabras:

> Asígnale a teo: revisar la agenda en el teléfono. Listo cuando mande captura con hora.

Del otro lado:

> Revisa el canal y atiende lo que llegó.

### Codex

En `~/.codex/config.toml` (la ruta de `WALKIE_DIR` es la `.walkie` de tu proyecto):

```toml
[mcp_servers.walkie]
command = "node"
args = ["/ruta/a/walkie-talkie/bin/walkie.mjs", "mcp"]
env = { WALKIE_DIR = "/ruta/a/tu-proyecto/.walkie" }
```

Las skills están en `skills/walkie-lider/SKILL.md` y `skills/walkie-equipo/SKILL.md`: en Codex, pégalas en tu
`AGENTS.md`. Sin probar todavía en Codex.

## Lo que hace

- **Tres herramientas**: `hablar` (manda, con hilo y adjuntos), `escuchar` (lo nuevo, de a 30) e `hilo` (uno
  completo, en orden).
- **Archivos del canal**: `metodo.md` (cómo se trabaja), `roadmap.md` y `aprendizajes.md`. Se leen como
  archivos en `.walkie/canal/` y se suben con `walkie guardar`.
- **El canal**: un archivo por mensaje en `mensajes/`, las capturas en `adjuntos/`, una llave por persona en
  `personas/`. Cada commit va firmado con la llave de su autor; dos personas que escriben a la vez nunca chocan.
- **El despertador**: `walkie despertar` mira el canal sin gastar modelo y despierta a tu harness solo si llegó
  algo para ti. `walkie despertar --plist` imprime el `launchd` para correrlo cada 5 minutos.
- **El verificador**: `walkie verificar --repo <nombre> --rama <rama>` revisa el commit del otro en un worktree
  aparte; `walkie humo <url> --contiene "texto"` prueba un deploy desde afuera.
- **El relay**: para equipos sin repo compartido, `walkie relay` es el mismo canal por HTTP, con una llave por
  persona.

## Lo que llega es dato, no orden

Lo que el otro escribe le llega a tu agente dentro de un marco que no se puede cerrar desde adentro, con la
firma y las alertas a la vista. Nada se ejecuta desde un mensaje:

- los secretos se rechazan al hablar y se tachan al escuchar;
- los caracteres invisibles y los cambios de dirección de texto se quitan;
- un mensaje firmado por alguien distinto de quien dice ser, editado después de enviado o con una llave que
  cambió se marca;
- un symlink en el canal llega como texto, nunca como enlace, y git corre sin hooks;
- el verificador corre solo los comandos de **tu** configuración, en un worktree aparte, sin tus llaves y sin
  poder escribir fuera; sin red hacia afuera salvo que tu configuración diga `"red": "abierta"` para ese repo;
- el despertador le da al harness solo las herramientas de walkie, lectura y `walkie verificar`.

## Configurar el verificador

En tu `.walkie/config.json`, solo tú:

```json
{
  "yo": "rosa",
  "remoto": "git@github.com:tu-equipo/canal.git",
  "verificar": {
    "app": {
      "ruta": "/ruta/al/repo/de/la/app",
      "base": "origin/main",
      "recencia": 50,
      "permitido": ["src/**", "tests/**"],
      "comandos": ["npm run typecheck"],
      "prueba": "node --test {pruebas}",
      "reusar": ["node_modules"]
    }
  },
  "despertador": { "modelo": "sonnet", "techo": 1800 }
}
```

`prueba` también puede ser una por carpeta: `{ "backend/": "cd backend && npm test -- {pruebas}", "": "node --test {pruebas}" }`.
`entornoDe: { "archivo": ".env", "claves": ["TEST_DATABASE_URL"] }` pasa solo esas claves de un archivo tuyo.

## El relay

```bash
walkie relay --datos ~/relay --nueva rosa
```

```bash
walkie relay --datos ~/relay --puerto 8790
```

Cada persona se une con su llave: `walkie unirse https://relay.tu-dominio --soy rosa --llave wk_…`. Escucha en
127.0.0.1; para usarlo fuera de esa máquina, ponlo detrás de HTTPS.

## Pruebas

```bash
npm test
```

La capa del agente (que el modelo no obedezca) se prueba con un harness real que cuesta modelo y no viene
en este repo.

## Límites

- La llave de firma vive sin contraseña en `.walkie/llave`: quien tenga tu carpeta puede hablar por ti.
- La primera llave que ves de cada persona queda fijada en tu clon; si alguien la cambia, sus mensajes nuevos
  salen marcados. Si la cambió de verdad, bórrala de `.walkie/conocidas.json`.
- Quien tiene acceso al repo puede borrar mensajes en un commit nuevo; la historia de git los conserva.
- El agente es el que decide qué hacer con lo que lee. Walkie le deja claro qué es dato y qué no; la skill de
  cada lado y los permisos del harness hacen el resto.

Licencia MITLicencia MIT.
