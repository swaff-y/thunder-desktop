import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as {
  version: string
}

export default defineConfig({
  main: {
    // TCC-005: main imports `@swaff-y/thunder-chat-core/headless`, which
    // carries no React, so the package can stay externalised the way every
    // other dependency does. The previous workaround bundled it into main to
    // tree-shake React out — that worked, but it relied on this config
    // remembering to do it, and forgetting cost a packaged app that dies on
    // launch while `npm run dev` stays green.
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [react()]
  }
})
