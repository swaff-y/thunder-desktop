import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify('test')
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts']
        }
      }
    ]
  }
})
