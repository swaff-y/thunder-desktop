import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined' && !('thunder' in window)) {
  ;(window as unknown as { thunder: unknown }).thunder = {}
}

afterEach(() => {
  cleanup()
})
