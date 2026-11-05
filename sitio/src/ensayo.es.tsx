import Hilo from './escenas/hilo'
import Canal from './escenas/canal'
import Instalar from './escenas/instalar'
import Despertador from './escenas/despertador'
import Verificar from './escenas/verificar'
import Defensa from './escenas/defensa'
import { Llevar, Prompt, RUTA } from './llevar'

// The essay in Spanish. ensayo.en.tsx is the same page in English: same
// sections, same figures, in the same order; a change here goes there too.

export const SECCIONES = [
  ['mensaje', 'Un mensaje'],
  ['canal', 'El canal'],
  ['instalar', 'Instalar'],
  ['herramientas', 'Tres herramientas'],
  ['despertador', 'El despertador'],
  ['verificar', 'Verificar'],
  ['defensa', 'Lo que llega es dato'],
  ['relaciones', 'Socio o equipo'],
  ['limites', 'Límites'],
  ['notas', 'Notas'],
] as const

export default function Ensayo() {
  return (
    <>
      <p>
        Walkie Talkie conecta tu harness con el de tu socio o el de tu equipo. Tu agente asigna, avisa, enseña y revisa
        los commits y los deploys del otro; el del otro reporta, pregunta y cuenta lo que aprendió. Es para quien ya
        trabaja con un agente y quiere que el trabajo con otra persona pase por ahí, no por un chat aparte.
      </p>

      <Llevar />

      <figure className="hero">
        <Hilo />
        <figcaption>Rosa asignó, Teo dice que terminó y el agente de Rosa lo verifica. El estado del hilo sale de leer lo que se dijo.</figcaption>
      </figure>

      <h2 id="mensaje">Un mensaje</h2>
      <p>El protocolo es un mensaje y nada más:</p>
      <pre className="comando">
        <span className="n">1</span>
        <code>
          {'{ '}<span className="c">de</span>, <span className="c">para</span>, <span className="c">hilo</span>, <span className="c">texto</span>, <span className="c">adjuntos</span>{' }'}
        </code>
      </pre>
      <p>
        No hay tipos. Si es una tarea, un aviso, un reporte, una pregunta o un veredicto, lo dice el texto, y lo entiende
        el agente que lo lee, como lo entendería una persona. Abierto, hecho o verificado tampoco son campos: se deducen
        del hilo.
      </p>
      <p>
        Sale de una bandeja real entre un líder y su pasante de QA. Sus 337 mensajes (envíos, respuestas, tareas y avisos)
        caben en esos cinco campos sin perder nada que se usara, y el tipo de cada envío y el estado de cada respuesta se
        deducen del texto en todos los casos.
      </p>

      <h2 id="canal">El canal</h2>
      <p>
        El canal es un repo git privado que comparten los dos. Cada mensaje es un archivo, así que dos personas que
        escriben a la vez nunca chocan: treinta envíos simultáneos desde dos carpetas llegan los treinta, sin un merge.
        Cada commit va firmado con la llave SSH de quien lo escribe, y quien se hace pasar por otro queda a la vista.
      </p>

      <figure className="demo" id="demo-canal">
        <Canal />
        <figcaption>Un mensaje es un archivo de cinco campos. La firma del commit dice quién lo escribió.</figcaption>
      </figure>

      <p>
        Lo que no es conversación vive en el mismo canal como archivos: <code>metodo.md</code> con las reglas de trabajo,{' '}
        <code>roadmap.md</code> y <code>aprendizajes.md</code>. Se editan, se versionan y cada lado los lee cuando le
        sirven.
      </p>

      <h2 id="instalar">Instalar</h2>
      <p>Pégale esto a tu agente, abierto en la carpeta de tu proyecto:</p>
      <Prompt />
      <p>O a mano. Walkie Talkie todavía no está publicado: la copia se pasa a mano y vive en {RUTA}.</p>
      <pre className="comando">
        <span className="n">
          1{'\n'}2
        </span>
        <code>
          <span className="c">cd</span> ~/tu-proyecto{'\n'}
          <span className="c">node</span> {RUTA}/bin/walkie.mjs unirse <span className="f">&lt;repo-del-canal&gt;</span> --soy <span className="f">&lt;tu-nombre&gt;</span>
        </code>
      </pre>
      <p>
        Eso clona el canal en <code>.walkie/</code>, crea una llave para firmar, te suma a las personas del canal y deja el
        servidor <code>walkie</code> en el <code>.mcp.json</code> de la carpeta, que Claude Code carga al abrirla.
      </p>

      <figure className="demo" id="demo-instalar">
        <Instalar />
        <figcaption>Una carpeta vacía entra al canal con un comando. El harness la abre con las tres herramientas.</figcaption>
      </figure>

      <p>
        Dos carpetas de cero en un mismo Mac, cada una con su Claude Code, hicieron así el ciclo completo: asignar, hecho y
        verificado, solo con texto. Codex lee el mismo servidor; esa mitad todavía no está probada.
      </p>

      <h2 id="herramientas">Tres herramientas</h2>
      <table className="modos">
        <thead>
          <tr>
            <th scope="col">Herramienta</th>
            <th scope="col">Qué hace</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>hablar</td>
            <td>Manda un mensaje a una persona del canal, nuevo o dentro de un hilo, con capturas, enlaces o la rama.</td>
          </tr>
          <tr>
            <td>escuchar</td>
            <td>Trae lo nuevo que te escribieron y lo marca como leído.</td>
          </tr>
          <tr>
            <td>hilo</td>
            <td>Un hilo completo, en orden: así se sabe en qué quedó algo.</td>
          </tr>
        </tbody>
      </table>
      <p>Los archivos del canal no son herramientas: el agente los lee como cualquier archivo.</p>

      <h2 id="despertador">El despertador</h2>
      <p>
        El despertador mira el canal cada pocos minutos con una operación barata: trae el repo y cuenta lo nuevo para ti. Si
        no llegó nada, no llama al modelo. Si llegó algo, despierta a tu harness una vez, con un techo de tiempo, para que
        escuche y responda.
      </p>

      <figure className="demo" id="demo-despertador">
        <Despertador />
        <figcaption>Una mañana sin mensajes no gasta nada. El mensaje de Teo despierta al harness una sola vez.</figcaption>
      </figure>

      <h2 id="verificar">Verificar</h2>
      <p>
        Cuando el otro cuenta que hizo un commit, su agente adjunta la rama. El tuyo la revisa en un worktree aparte, sin
        red y sin tus llaves: que salga de una punta reciente, que solo toque lo que la tarea permite, que el typecheck y las pruebas
        pasen, y que la prueba nueva falle sin el arreglo. Un deploy contado se prueba desde afuera: la URL responde y la
        pantalla que cambió existe. El veredicto vuelve al hilo con su prueba.
      </p>

      <figure className="demo" id="demo-verificar">
        <Verificar />
        <figcaption>La rama del otro, revisada sin tocar la tuya. Lo que vuelve al hilo es el veredicto y cómo se llegó a él.</figcaption>
      </figure>

      <h2 id="defensa">Lo que llega es dato</h2>
      <p>
        Conectar dos harness solo sirve si uno no puede mandar al otro. Lo que llega por el canal nunca es una orden:
        entra en un marco que no se cierra desde adentro, sin caracteres invisibles, con los secretos tachados y con una
        alerta cuando el texto intenta mandar al agente. Al hablar, un mensaje con una llave se rechaza. Un adjunto solo
        puede ser un archivo del canal, y un enlace simbólico llega como texto.
      </p>

      <figure className="demo" id="demo-defensa">
        <Defensa />
        <figcaption>Un mensaje hostil llega enmarcado y con sus alertas. Se lee; no se obedece.</figcaption>
      </figure>

      <p>
        La prueba son veintiún mensajes hostiles contra el canal: inyección, comandos, llaves, suplantación, marcos falsos,
        texto escondido. No pasa ninguno.
      </p>

      <h2 id="relaciones">Socio o equipo</h2>
      <p>
        El canal no sabe qué relación hay entre los dos. La define la skill de cada lado, y el mismo canal sirve para un
        pasante, un socio o un cliente sin cambiar nada.
      </p>
      <table className="modos">
        <thead>
          <tr>
            <th scope="col">Relación</th>
            <th scope="col">Cómo trabajan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Subordinado</td>
            <td>El líder asigna, verifica y enseña. El otro reporta con evidencia y cuenta lo que aprendió.</td>
          </tr>
          <tr>
            <td>Socio</td>
            <td>Simétrico: los dos proponen y los dos verifican lo del otro.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="limites">Límites</h2>
      <p>
        No es un chat en tiempo real: el despertador mira cada pocos minutos. El verificador revisa hechos (la rama, el
        diff, las pruebas, la URL), no decide si el cambio es bueno; eso sigue siendo de una persona. Para equipos sin un
        repo compartido está el relay, con llave por persona: para usarlo entre máquinas va detrás de HTTPS.
      </p>

      <section className="notas" aria-labelledby="notas">
        <h2 id="notas">Notas</h2>
        <ol>
          <li id="n1">
            Las escenas son de Stageshow, de Benji Taylor (
            <a href="https://benji.org/stageshow">benji.org/stageshow</a>, licencia MIT), usado tal cual. Las personas y los
            repos de las escenas son inventados.
          </li>
        </ol>
      </section>
    </>
  )
}
