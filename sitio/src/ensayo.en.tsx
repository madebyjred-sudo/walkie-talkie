import Hilo from './escenas/hilo'
import Canal from './escenas/canal'
import Instalar from './escenas/instalar'
import Despertador from './escenas/despertador'
import Verificar from './escenas/verificar'
import Defensa from './escenas/defensa'
import { Llevar, Prompt, RUTA } from './llevar'

// The essay in English: the same page as ensayo.es.tsx, section for section.

export const SECCIONES = [
  ['mensaje', 'One message'],
  ['canal', 'The channel'],
  ['instalar', 'Install'],
  ['herramientas', 'Three tools'],
  ['despertador', 'The alarm'],
  ['verificar', 'Verify'],
  ['defensa', 'What arrives is data'],
  ['relaciones', 'Partner or team'],
  ['limites', 'Limits'],
  ['notas', 'Notes'],
] as const

export default function Ensayo() {
  return (
    <>
      <p>
        Walkie Talkie connects your harness with your partner's or your team's. Your agent assigns, gives notice, teaches
        and reviews the other side's commits and deploys; theirs reports, asks and tells what it learned. It's for anyone
        who already works with an agent and wants the work with another person to go through it, not through a separate
        chat.
      </p>

      <Llevar />

      <figure className="hero">
        <Hilo />
        <figcaption>Rosa assigned, Teo says it's done and Rosa's agent verifies it. The thread's state comes from reading what was said.</figcaption>
      </figure>

      <h2 id="mensaje">One message</h2>
      <p>The protocol is one message and nothing else:</p>
      <pre className="comando">
        <span className="n">1</span>
        <code>
          {'{ '}<span className="c">de</span>, <span className="c">para</span>, <span className="c">hilo</span>, <span className="c">texto</span>, <span className="c">adjuntos</span>{' }'}
        </code>
      </pre>
      <p>
        From, to, thread, text, attachments. There are no types. Whether it's a task, a notice, a report, a question or a
        verdict, the text says so, and the agent reading it understands it the way a person would. Open, done or verified
        aren't fields either: they're read from the thread.
      </p>
      <p>
        It comes from a real inbox between a lead and their QA intern. Its 337 messages (reports, answers, tasks and
        notices) fit those five fields without losing anything that was used, and the type of every report and the status
        of every answer can be read from the text in every case.
      </p>

      <h2 id="canal">The channel</h2>
      <p>
        The channel is a private git repo the two of you share. Every message is a file, so two people writing at once
        never collide: thirty sends at the same time from two folders, all thirty arrive, without a merge. Every commit is
        signed with its writer's SSH key, and whoever poses as someone else shows.
      </p>

      <figure className="demo" id="demo-canal">
        <Canal />
        <figcaption>A message is a file with five fields. The commit's signature says who wrote it.</figcaption>
      </figure>

      <p>
        What isn't conversation lives in the same channel as files: <code>metodo.md</code> with the working rules,{' '}
        <code>roadmap.md</code> and <code>aprendizajes.md</code>. They're edited, versioned, and each side reads them when
        it needs them.
      </p>

      <h2 id="instalar">Install</h2>
      <p>Paste this to your agent, open in your project's folder:</p>
      <Prompt />
      <p>Or by hand. Walkie Talkie isn't published yet: the copy is handed over and lives in {RUTA}.</p>
      <pre className="comando">
        <span className="n">
          1{'\n'}2
        </span>
        <code>
          <span className="c">cd</span> ~/your-project{'\n'}
          <span className="c">node</span> {RUTA}/bin/walkie.mjs unirse <span className="f">&lt;channel-repo&gt;</span> --soy <span className="f">&lt;your-name&gt;</span>
        </code>
      </pre>
      <p>
        That clones the channel into <code>.walkie/</code>, makes a signing key, adds you to the channel's people and puts
        the <code>walkie</code> server in the folder's <code>.mcp.json</code>, which Claude Code loads when it opens it.
      </p>

      <figure className="demo" id="demo-instalar">
        <Instalar />
        <figcaption>An empty folder joins the channel with one command. The harness opens it with the three tools.</figcaption>
      </figure>

      <p>
        Two empty folders on one Mac, each with its own Claude Code, ran the whole cycle this way: assigned, done and
        verified, with text alone. Codex reads the same server; that half isn't tested yet.
      </p>

      <h2 id="herramientas">Three tools</h2>
      <table className="modos">
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>hablar</td>
            <td>Sends a message to someone in the channel, new or inside a thread, with screenshots, links or the branch.</td>
          </tr>
          <tr>
            <td>escuchar</td>
            <td>Brings what's new for you and marks it as read.</td>
          </tr>
          <tr>
            <td>hilo</td>
            <td>A whole thread, in order: that's how you know where something stands.</td>
          </tr>
        </tbody>
      </table>
      <p>The channel's files aren't tools: the agent reads them like any file.</p>

      <h2 id="despertador">The alarm</h2>
      <p>
        The alarm looks at the channel every few minutes with a cheap operation: it pulls the repo and counts what's new
        for you. If nothing came, it doesn't call the model. If something did, it wakes your harness once, with a time
        limit, to listen and answer.
      </p>

      <figure className="demo" id="demo-despertador">
        <Despertador />
        <figcaption>A morning without messages costs nothing. Teo's message wakes the harness just once.</figcaption>
      </figure>

      <h2 id="verificar">Verify</h2>
      <p>
        When the other side says it made a commit, its agent attaches the branch. Yours checks it in a separate worktree, offline
        and without your keys: that it starts from a recent tip, touches only what the task allows, passes typecheck and tests, and that the new
        test fails without the fix. A deploy that's reported is tested from outside: the URL answers and the screen that
        changed is there. The verdict goes back to the thread with its proof.
      </p>

      <figure className="demo" id="demo-verificar">
        <Verificar />
        <figcaption>The other side's branch, checked without touching yours. What goes back to the thread is the verdict and how it was reached.</figcaption>
      </figure>

      <h2 id="defensa">What arrives is data</h2>
      <p>
        Connecting two harnesses only works if one can't command the other. What comes through the channel is never an
        order: it comes inside a frame that can't be closed from within, with no invisible characters, secrets struck out,
        and an alert when the text tries to command the agent. When speaking, a message with a key is refused. An
        attachment can only be a file in the channel, and a symlink arrives as text.
      </p>

      <figure className="demo" id="demo-defensa">
        <Defensa />
        <figcaption>A hostile message arrives framed, with its alerts. It's read; it's not obeyed.</figcaption>
      </figure>

      <p>
        The test is twenty-one hostile messages against the channel: injection, commands, keys, impersonation, fake frames,
        hidden text. None gets through.
      </p>

      <h2 id="relaciones">Partner or team</h2>
      <p>
        The channel doesn't know how the two of you relate. Each side's skill defines it, and the same channel works for an
        intern, a partner or a client without changing anything.
      </p>
      <table className="modos">
        <thead>
          <tr>
            <th scope="col">Relation</th>
            <th scope="col">How they work</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Report</td>
            <td>The lead assigns, verifies and teaches. The other reports with evidence and tells what they learned.</td>
          </tr>
          <tr>
            <td>Partner</td>
            <td>Symmetric: both propose and both verify the other's work.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="limites">Limits</h2>
      <p>
        It isn't a real-time chat: the alarm looks every few minutes. The verifier checks facts (the branch, the diff, the
        tests, the URL); it doesn't decide whether the change is good, that's still a person's call. For teams without a
        shared repo there's the relay, with a key per person: to use it across machines, put it behind HTTPS.
      </p>

      <section className="notas" aria-labelledby="notas">
        <h2 id="notas">Notes</h2>
        <ol>
          <li id="n1">
            The scenes are Stageshow, by Benji Taylor (<a href="https://benji.org/stageshow">benji.org/stageshow</a>, MIT
            license), used as is. The people and repos in the scenes are made up.
          </li>
        </ol>
      </section>
    </>
  )
}
