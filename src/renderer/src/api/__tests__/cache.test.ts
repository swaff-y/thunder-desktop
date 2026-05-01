import { describe, expect, it, vi } from 'vitest'
import { persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { QueryClient } from '@tanstack/react-query'
import { PERSIST_KEY, cacheBuster, cacheMaxAge, createPersister, queryClient } from '../cache'

describe('cache', () => {
  it('queryClient gcTime stays under presigned-URL TTL', () => {
    const opts = queryClient.getDefaultOptions().queries!
    expect(opts.staleTime).toBe(5 * 60 * 1000)
    // gcTime must be < the 15-min Halo presigned-URL TTL so cached
    // responses don't outlive their embedded image URLs (TD-034).
    expect(opts.gcTime).toBe(10 * 60 * 1000)
    expect(opts.refetchOnWindowFocus).toBe(true)
  })

  it('cacheBuster pulls from __APP_VERSION__ define', () => {
    expect(cacheBuster).toBe('test')
  })

  it('cacheMaxAge aligns with gcTime and stays under URL TTL', () => {
    expect(cacheMaxAge).toBe(10 * 60 * 1000)
  })

  it('persister writes hydrated cache through stub key-val storage', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        store.set(k, v)
      }),
      removeItem: vi.fn(async (k: string) => {
        store.delete(k)
      })
    }
    const persister = createPersister(storage)
    const client = new QueryClient()
    client.setQueryData(['ping'], 42)

    await persistQueryClientSave({ queryClient: client, persister, buster: cacheBuster })

    expect(storage.setItem).toHaveBeenCalled()
    const [key, raw] = storage.setItem.mock.calls[0]
    expect(key).toBe(PERSIST_KEY)
    const dehydrated = JSON.parse(raw as string)
    expect(dehydrated.buster).toBe('test')
  })
})
