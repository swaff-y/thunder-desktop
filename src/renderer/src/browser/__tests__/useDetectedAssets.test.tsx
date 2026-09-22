import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { ThunderAssetDetectedPayload } from '../../../../preload/thunder-api'
import { useDetectedAssets, type DetectedAssets } from '../useDetectedAssets'
import type { BrowserNav } from '../useBrowserNav'

const THIS_WEBVIEW = 7
const OTHER_WEBVIEW = 9

function payload(id: string, webContentsId: number): ThunderAssetDetectedPayload {
  return {
    id,
    webContentsId,
    pageUrl: 'https://example.com/watch',
    assetUrl: `https://cdn.example.com/${id}.m3u8`,
    mimeType: 'application/vnd.apple.mpegurl',
    detectedAt: Date.now()
  }
}

/** Only the two fields `useDetectedAssets` reads. */
function navStub(): BrowserNav {
  return { url: 'https://example.com/watch', webContentsId: THIS_WEBVIEW } as BrowserNav
}

function renderAssets(): {
  assets: () => DetectedAssets
  detect: (payload: ThunderAssetDetectedPayload) => void
} {
  let listener: ((payload: ThunderAssetDetectedPayload) => void) | null = null
  window.thunder = {
    browser: {
      getCurrentAssets: () => Promise.resolve([]),
      onAssetDetected: (callback: (payload: ThunderAssetDetectedPayload) => void) => {
        listener = callback
        return () => {
          listener = null
        }
      }
    }
  } as unknown as typeof window.thunder

  let latest: DetectedAssets | null = null
  function Harness(): null {
    latest = useDetectedAssets(navStub())
    return null
  }
  render(<Harness />)

  return {
    assets: () => {
      if (!latest) throw new Error('harness did not render')
      return latest
    },
    detect: (event) => {
      act(() => {
        listener?.(event)
      })
    }
  }
}

afterEach(() => {
  window.thunder = undefined as unknown as typeof window.thunder
  vi.restoreAllMocks()
})

describe('useDetectedAssets: whose detection it is', () => {
  it('keeps a detection from its own webview', () => {
    const { assets, detect } = renderAssets()

    detect(payload('asset-mine', THIS_WEBVIEW))

    expect(assets().assets.map((asset) => asset.id)).toEqual(['asset-mine'])
  })

  // TD-089: the subscription is partition-wide, so every open browser tab
  // is handed every other tab's detections.
  it('ignores a detection from another webview', () => {
    const { assets, detect } = renderAssets()

    detect(payload('asset-theirs', OTHER_WEBVIEW))

    expect(assets().assets).toEqual([])
  })

  it('keeps only its own when both arrive', () => {
    const { assets, detect } = renderAssets()

    detect(payload('asset-theirs', OTHER_WEBVIEW))
    detect(payload('asset-mine', THIS_WEBVIEW))

    expect(assets().assets.map((asset) => asset.id)).toEqual(['asset-mine'])
  })
})
