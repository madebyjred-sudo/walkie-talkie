// W2 del contrato C1: la landing en WebKit y Firefox. Captura cada seccion a
// 1280 y a 390, revisa que no haya errores de consola ni scroll horizontal, y
// que el morph de idioma corra. Uso: node revisar-navegadores.mjs [url] [outdir]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/Volumes/TERA/MAC/taste/package.json')
const { webkit, firefox, chromium } = require('playwright')

const url = process.argv[2] || 'http://localhost:5320/'
const out = process.argv[3] || new URL('./capturas/navegadores/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

// Cada seccion de la pagina (SECCIONES de ensayo.es.tsx), con su escena si la tiene
const SECCIONES = [
  ['cabeza', '.cabeza'],
  ['mensaje', '#mensaje'],
  ['canal', '#canal'],
  ['demo-canal', '#demo-canal'],
  ['instalar', '#instalar'],
  ['demo-instalar', '#demo-instalar'],
  ['herramientas', '#herramientas'],
  ['despertador', '#despertador'],
  ['demo-despertador', '#demo-despertador'],
  ['verificar', '#verificar'],
  ['demo-verificar', '#demo-verificar'],
  ['defensa', '#defensa'],
  ['demo-defensa', '#demo-defensa'],
  ['relaciones', '#relaciones'],
  ['limites', '#limites'],
  ['notas', '#notas'],
]

const fallos = []

async function revisar(navegador, nombre) {
  for (const [etiqueta, ancho, alto] of [
    ['1280', 1280, 900],
    ['390', 390, 844],
  ]) {
    // WebKit no conoce el permiso de escritura al portapapeles: ahi se prueba
    // el boton por su resultado en la pagina, no por el portapapeles
    const permisos = nombre === 'webkit' ? ['clipboard-read'] : ['clipboard-read', 'clipboard-write']
    const ctx = await navegador.newContext({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      permissions: permisos,
    })
    const page = await ctx.newPage()
    const errores = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errores.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1200)

    // Scroll horizontal: el documento no puede ser mas ancho que la ventana.
    // Un elemento que se sale de la ventana esta bien si un ancestro lo corta
    // (las escenas se cortan por diseno, al estilo benji.org); lo que no puede
    // es escaparse de todos y arrastrar el scroll de la pagina.
    const h = await page.evaluate(() => {
      const cortado = (e) => {
        for (let p = e.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX
          if (ox !== 'visible') return true
        }
        return false
      }
      return {
        doc: document.documentElement.scrollWidth,
        cuerpo: document.body.scrollWidth,
        win: window.innerWidth,
        salidos: [...document.querySelectorAll('body *')]
          .filter((e) => {
            const r = e.getBoundingClientRect()
            return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !cortado(e)
          })
          .slice(0, 6)
          .map((e) => `${e.tagName.toLowerCase()}.${(e.className && String(e.className).split(' ')[0]) || ''} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`),
      }
    })
    if (h.doc > h.win + 1) fallos.push(`${nombre} ${etiqueta}: scroll horizontal, documento ${h.doc} > ventana ${h.win}`)
    if (h.cuerpo > h.win + 1) fallos.push(`${nombre} ${etiqueta}: scroll horizontal en body, ${h.cuerpo} > ventana ${h.win}`)
    if (h.salidos.length) fallos.push(`${nombre} ${etiqueta}: elementos fuera de la ventana sin recorte: ${h.salidos.join(' | ')}`)

    // El morph de idioma: al cambiar, el texto visible pasa al otro idioma
    const esAntes = await page.evaluate(() => document.querySelector('.ensayo p')?.textContent?.slice(0, 60))
    await page.click('.cabeza__linea a')
    await page.waitForTimeout(1400)
    const enAntes = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      texto: document.querySelector('.ensayo p')?.textContent?.slice(0, 60),
      ruta: location.pathname,
    }))
    if (enAntes.lang !== 'en') fallos.push(`${nombre} ${etiqueta}: el morph no cambia <html lang> a en (quedo ${enAntes.lang})`)
    if (enAntes.texto === esAntes) fallos.push(`${nombre} ${etiqueta}: el morph no cambia el texto del primer parrafo`)
    if (!enAntes.ruta.startsWith('/en')) fallos.push(`${nombre} ${etiqueta}: el morph no deja la ruta en /en (quedo ${enAntes.ruta})`)
    // Y de vuelta
    await page.click('.cabeza__linea a')
    await page.waitForTimeout(1400)
    const esDespues = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      texto: document.querySelector('.ensayo p')?.textContent?.slice(0, 60),
      ruta: location.pathname,
    }))
    if (esDespues.lang !== 'es') fallos.push(`${nombre} ${etiqueta}: volver del morph no cambia <html lang> a es (quedo ${esDespues.lang})`)
    if (esDespues.texto !== esAntes) fallos.push(`${nombre} ${etiqueta}: volver del morph no devuelve el texto espanol`)
    if (esDespues.ruta !== '/') fallos.push(`${nombre} ${etiqueta}: volver del morph no deja la ruta en / (quedo ${esDespues.ruta})`)

    // Capturas: cada seccion, en su idioma, con su escena pintada
    for (const [id, sel] of SECCIONES) {
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel)
      await page.waitForTimeout(450)
      const el = await page.$(sel)
      if (!el) {
        fallos.push(`${nombre} ${etiqueta}: no aparece la seccion ${id} (${sel})`)
        continue
      }
      await el.screenshot({ path: `${out}${nombre}-${etiqueta}-${id}.png` })
    }
    // La pagina entera, para ver el conjunto
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${out}${nombre}-${etiqueta}-pagina.png`, fullPage: true })

    // El morph animado: con reducedMotion no corre, asi que se emula la
    // preferencia contraria. El muestreo va dentro de la pagina y sobre el
    // parrafo entero: el morph se asienta de izquierda a derecha, asi que un
    // parrafo largo ya tiene sus primeras lineas en el otro idioma cuando el
    // final todavia esta en flicker. Mirar un trozo o mirar tarde da un falso
    // "no anima".
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const anim = await page.evaluate(async () => {
      // El parrafo se busca en cada frame: al cambiar de idioma la pagina se
      // vuelve a montar (Pagina key={lang}) y el nodo viejo se desprende
      const antes = document.querySelector('.ensayo p').textContent
      const vistas = []
      const t0 = performance.now()
      await new Promise((fin) => {
        const tick = () => {
          vistas.push(document.querySelector('.ensayo p').textContent)
          if (performance.now() - t0 < 300) requestAnimationFrame(tick)
          else fin()
        }
        requestAnimationFrame(tick)
        document.querySelector('.cabeza__linea a').click()
      })
      return { antes, vistas }
    })
    // La captura cae a mitad del viaje, antes de que el texto se asiente
    await page.screenshot({ path: `${out}${nombre}-${etiqueta}-morph.png` })
    await page.waitForTimeout(1400)
    const despues = await page.evaluate(() => document.querySelector('.ensayo p')?.textContent)
    const intermedias = anim.vistas.filter((t) => t !== anim.antes && t !== despues)
    if (anim.antes === despues) fallos.push(`${nombre} ${etiqueta}: el morph no cambia el texto del parrafo`)
    if (!intermedias.length) fallos.push(`${nombre} ${etiqueta}: el morph no anima, el texto llega completo de una (${anim.vistas.length} frames vistos)`)
    // Se vuelve al espanol para que el boton de copiar corra en el idioma de entrada
    await page.click('.cabeza__linea a')
    await page.waitForTimeout(1200)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // El boton de copiar: deja el prompt en el portapapeles (en WebKit, sin
    // permiso de escritura, se comprueba que el boton responde y avisa)
    await page.click('.llevar .boton--lleno')
    await page.waitForTimeout(300)
    if (nombre === 'webkit') {
      const aviso = await page.evaluate(() => document.querySelector('.llevar .boton--lleno span')?.textContent)
      if (aviso !== 'Copiado') fallos.push(`webkit ${etiqueta}: el boton de copiar no avisa (dejo ${JSON.stringify(aviso)})`)
    } else {
      const portapapeles = await page.evaluate(() => navigator.clipboard.readText())
      if (!/walkie\.mjs unirse/.test(portapapeles)) {
        fallos.push(`${nombre} ${etiqueta}: el boton no copia el prompt (portapapeles: ${JSON.stringify(portapapeles.slice(0, 50))})`)
      }
    }

    if (errores.length) fallos.push(`${nombre} ${etiqueta}: consola con ${errores.length} avisos:\n    ${errores.slice(0, 10).join('\n    ')}`)
    console.log(`${nombre} ${etiqueta}: ${SECCIONES.length} secciones capturadas, ${errores.length} avisos de consola`)
    await ctx.close()
  }
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MOTORES = [
  [webkit, 'webkit', {}],
  [firefox, 'firefox', {}],
  // Chrome de verdad: P3 es justo sobre donde cae la pila mono en Chrome para Mac
  [chromium, 'chrome', { executablePath: CHROME }],
]

for (const [tipo, nombre, opciones] of MOTORES) {
  let navegador
  try {
    navegador = await tipo.launch(opciones)
  } catch (e) {
    // Firefox en macOS guarda su perfil en ~/Library/Application Support/Firefox.
    // Si el sistema no deja crear esa carpeta, arranca, no encuentra el perfil y
    // se cae: se recoge la causa real en lugar de un "no arranca" a secas.
    // De la salida de Playwright se queda solo lo que dijo el navegador: las
    // lineas <...> y [pid=...] son su propia bitacora de lanzamiento
    const why = [...new Set(
      e.message
        .split('\n')
        .flatMap((l) => l.split(' - '))
        .map((l) => l.replace(/\[pid=\d+\]\[err\]\s*/, '').trim())
        .filter((l) => l && !/^[<[]|^-$|^(browserType|Browser logs|Call log|Failed to launch)/.test(l)),
    )].join(' · ')
    fallos.push(`${nombre}: no arranca en esta maquina, la revision quedo sin hacer. ${why}`)
    console.log(`${nombre}: NO ARRANCA. ${why}`)
    continue
  }
  try {
    await revisar(navegador, nombre)
  } finally {
    await navegador.close()
  }
}

if (fallos.length) {
  console.log(`\nFALLOS (${fallos.length}):`)
  for (const f of fallos) console.log(`- ${f}`)
  process.exitCode = 1
} else {
  console.log('\nSin fallos: 0 errores de consola, sin scroll horizontal, morph ES/EN en los dos navegadores.')
}
