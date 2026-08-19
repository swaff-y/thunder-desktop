import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as {
  version: string
}

export default defineConfig({
  main: {
    build: {
      // TCC-002: `@swaff-y/thunder-chat-core` ships one entry that mixes the
      // headless half (`createContextClient`, the taxonomy, the caps) with the
      // React half (`ChatProvider`). Externalised, `out/main/index.js` requires
      // the package at runtime, the package requires `react`, and `react` is a
      // devDependency that electron-builder does not put in the asar — so the
      // packaged app dies on launch with "Cannot find module 'react'" while
      // `npm run dev` is perfectly happy.
      //
      // Bundling it into main instead lets Vite tree-shake: main uses two
      // exports, the package is `sideEffects: false`, and React falls out
      // entirely. The real fix is a `./headless` subpath export on the package
      // so this cannot be imported by accident — see TCC-005.
      externalizeDeps: {
        exclude: ['@swaff-y/thunder-chat-core']
      }
    }
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
