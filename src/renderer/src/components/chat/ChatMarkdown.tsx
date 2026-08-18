import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * TD-067: the assistant's answer, rendered.
 *
 * `text` is markdown on the wire (thunder-context's `docs/wire-contract.md`) —
 * not "may contain markdown". The model writes it unprompted on ordinary
 * catalogue questions, so a plain `<p>{text}</p>` shows the user literal `**`.
 *
 * Two rules hold this together:
 *
 * 1. **It is model-authored, so it is untrusted.** `react-markdown` renders to
 *    React elements rather than an HTML string, so raw HTML in the source is
 *    inert text unless `rehype-raw` is added. Do not add it. The old plain-text
 *    rendering was at least safe by construction; a renderer that loses that
 *    is a worse bug than the one it fixes.
 * 2. **A turn is not a document.** Headings render as emphasis and links leave
 *    through the OS rather than navigating the renderer.
 */

/** Only schemes a catalogue answer has any business linking to. */
const SAFE_SCHEMES = ["http:", "https:", "mailto:"]

function safeUrl(url: string): string {
  try {
    // Relative URLs resolve against the renderer's own `file:` origin and are
    // meaningless here, so a parse failure is a reason to drop the href.
    const { protocol } = new URL(url)
    return SAFE_SCHEMES.includes(protocol) ? url : ""
  } catch {
    return ""
  }
}

/**
 * A link in an answer points outside the app by definition — there is no
 * in-app route the model could know about. `openExternal` is allowlisted in
 * main (TD-021); navigating the renderer to a model-authored URL is not
 * something we want to be possible at all.
 */
function handleLinkClick(event: React.MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault()
  const href = event.currentTarget.getAttribute("href")
  if (!href) return
  void window.thunder?.shell.openExternal(href)
}

/**
 * Headings collapse to bold text: an `<h1>` inside a transcript wrecks the
 * type scale, and the model reaches for them to emphasise a line rather than
 * to structure a document.
 */
function Heading({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <strong className="chat-md-heading">{children}</strong>
}

const COMPONENTS: Components = {
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  a: ({ href, children }) => {
    const safe = href === undefined ? "" : safeUrl(href)
    // A dropped scheme keeps its text — the answer still reads correctly,
    // it simply isn't clickable.
    if (!safe) return <>{children}</>
    return (
      <a href={safe} onClick={handleLinkClick} rel="noreferrer noopener">
        {children}
      </a>
    )
  },
  // Tables can outgrow the panel; scrolling one is better than reflowing the
  // whole transcript around it.
  table: ({ children }) => (
    <div className="chat-md-table-wrap">
      <table>{children}</table>
    </div>
  )
}

const PLUGINS = [remarkGfm]

export default function ChatMarkdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="chat-said chat-md">
      <Markdown remarkPlugins={PLUGINS} urlTransform={safeUrl} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
