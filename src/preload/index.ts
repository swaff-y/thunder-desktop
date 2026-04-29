import { contextBridge } from 'electron'
import { thunderApi } from './thunder-api'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('thunder', thunderApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.thunder = thunderApi
}
