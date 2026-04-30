import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './theme/variables.css'
import './theme/bootstrap-overrides.css'
import { bootstrapEnv } from './config/env'

// Resolve `API_URL` from the main-process settings store before any
// module that captures it at load time (axios baseURL in `client.ts`)
// gets imported. The App tree is dynamic-imported below so its module
// graph evaluates AFTER `bootstrapEnv` has finished mutating `env.ts`.
bootstrapEnv().then(async () => {
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
