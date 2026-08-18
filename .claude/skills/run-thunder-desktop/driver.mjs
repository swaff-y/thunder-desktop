// REPL driver for thunder-desktop.
//
// Launches the BUILT app (out/main + out/renderer) through Playwright's
// Electron support and exposes stdin commands, so an agent can drive the UI
// without a human at the keyboard.
//
// Read the sibling SKILL.md first — in particular: build before launching, and
// never truncate the log file while this is running.
//
// Commands: launch ss text js ask click clicktext html transcript wait quit

import { createRequire } from 'node:module'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'

// `playwright-core` is deliberately NOT a dependency of this repo — it is agent
// tooling, and adding it would put a browser-automation package in the app's
// lockfile. Install it anywhere and point `NODE_PATH` (or `PLAYWRIGHT_CORE`) at
// it; see SKILL.md. Required rather than imported because ESM ignores
// `NODE_PATH` while CJS resolution honours it.
const require = createRequire(import.meta.url)
const { _electron: electron } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')

// .claude/skills/run-thunder-desktop/driver.mjs -> repo root
const APP_DIR = path.resolve(import.meta.dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(APP_DIR, '.driver-shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(
  APP_DIR,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
)

let app = null
let page = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function requirePage() {
  if (!page) throw new Error('launch first')
  return page
}

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched')
    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      cwd: APP_DIR,
      timeout: 60_000
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // No clean "React has painted" signal; the Browser tab's <webview> also
    // registers as a window and must not be mistaken for the UI.
    await sleep(4_000)
    console.log('launched. windows:', app.windows().map((w) => w.url()).join(' | '))
  },

  async ss(name) {
    const file = path.join(SHOT_DIR, `${name || `ss-${Date.now()}`}.png`)
    await requirePage().screenshot({ path: file })
    console.log('screenshot:', file)
  },

  /** Rendered text of the whole window — cheaper to read than a screenshot. */
  async text() {
    const body = await requirePage().evaluate(() => document.body.innerText)
    console.log('---TEXT---')
    console.log(body.slice(0, 4_000))
    console.log('---END---')
  },

  /** `js <expr>` — the rest of the line is an expression, awaited. */
  async js(...src) {
    const expr = src.join(' ')
    const out = await requirePage().evaluate(`(async () => { return (${expr}) })()`)
    console.log('JS:', JSON.stringify(out))
  },

  /**
   * `ask <question>` — types into the chat composer and submits it.
   *
   * React controls the input, so assigning `.value` is discarded on the next
   * render. The native setter plus a bubbling `input` event is what React's
   * synthetic layer listens for.
   */
  async ask(...words) {
    const question = words.join(' ')
    const ok = await requirePage().evaluate((q) => {
      const el = document.querySelector('#chat-question')
      if (!el) return false
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, q)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.chat-submit')?.click()
      return true
    }, question)
    console.log(
      ok ? `asked: ${question}` : 'ERROR: no #chat-question — chatEnabled off, or not on Home?'
    )
  },

  /** Resolves once the in-flight turn settles, or after `seconds` (default 180). */
  async settle(seconds) {
    const deadline = Date.now() + (Number(seconds) || 180) * 1_000
    while (Date.now() < deadline) {
      const busy = await requirePage().evaluate(
        () => !!document.querySelector('.chat-panel')?.innerText.includes('Stop')
      )
      if (!busy) return console.log('settled')
      await sleep(3_000)
    }
    console.log('TIMED OUT waiting for the turn to settle')
  },

  async click(selector) {
    const ok = await requirePage().evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      el.click()
      return true
    }, selector)
    console.log(ok ? `clicked ${selector}` : `ERROR: no element ${selector}`)
  },

  /**
   * `clicktext <text>` — first button/link whose text contains the argument.
   * Nav items, Stop and Clear are all reachable this way.
   */
  async clicktext(...words) {
    const needle = words.join(' ')
    const ok = await requirePage().evaluate((n) => {
      const els = [...document.querySelectorAll('button, a, [role="button"], nav a, nav button')]
      const el = els.find((e) => e.innerText?.trim().toLowerCase().includes(n.toLowerCase()))
      if (!el) return false
      el.click()
      return true
    }, needle)
    console.log(ok ? `clicked "${needle}"` : `ERROR: nothing clickable matching "${needle}"`)
  },

  async html(selector) {
    const html = await requirePage().evaluate((sel) => {
      const el = sel ? document.querySelector(sel) : document.body
      return el ? el.innerHTML.slice(0, 6_000) : 'not found'
    }, selector)
    console.log(html)
  },

  /** The persisted transcript, including each turn's `action.args`. */
  async transcript() {
    const stored = await requirePage().evaluate(() => sessionStorage.getItem('thunder_chat'))
    console.log(stored ?? '(empty)')
  },

  async wait(ms) {
    await sleep(Number(ms) || 1_000)
    console.log('waited', ms)
  },

  async quit() {
    if (app) await app.close()
    process.exit(0)
  }
}

const rl = readline.createInterface({ input: process.stdin })
console.log('driver ready. commands:', Object.keys(COMMANDS).join(' '))
rl.on('line', async (line) => {
  const [cmd, ...args] = line.trim().split(/\s+/)
  if (!cmd) return
  const fn = COMMANDS[cmd]
  if (!fn) return console.log('unknown command:', cmd)
  try {
    await fn(...args)
  } catch (error) {
    console.log('ERROR:', error.message)
  }
  // Sentinel: the caller polls the log for this rather than guessing a sleep.
  console.log('__DONE__')
})
