import type { ThunderApi } from './thunder-api'

declare global {
  interface Window {
    thunder: ThunderApi
  }
}

export {}
