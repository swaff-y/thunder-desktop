import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const FIVE_MINUTES = 5 * 60 * 1000
const TEN_MINUTES = 10 * 60 * 1000

// Halo presigned S3 URLs embedded in BE responses (record/category image
// `url`s) expire after 15 min. Persisted queries can otherwise outlive
// their URLs — on hydrate the cached response renders, useImage fetches
// the URL, S3 returns 403 "Request has expired" (TD-034). Keeping
// gcTime safely under 15 min rolls the in-memory cache over before URLs
// go stale; the persister's maxAge below enforces the same on rehydrate.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FIVE_MINUTES,
      gcTime: TEN_MINUTES,
      refetchOnWindowFocus: true
    }
  }
})

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => (await get<string>(key)) ?? null,
  setItem: (key: string, value: string): Promise<void> => set(key, value),
  removeItem: (key: string): Promise<void> => del(key)
}

export const PERSIST_KEY = 'thunder-desktop-react-query-cache'

type Persister = ReturnType<typeof createAsyncStoragePersister>

// Persister bucket lives in IDB under PERSIST_KEY. Bumping the app
// version invalidates the bucket via the `buster` field on the
// PersistQueryClientProvider so users don't hydrate a stale schema after
// an upgrade.
export function createPersister(
  storage: typeof idbStorage = idbStorage
): Persister {
  return createAsyncStoragePersister({
    storage,
    key: PERSIST_KEY,
    throttleTime: 1000
  })
}

export const cacheBuster = __APP_VERSION__
// Aligns with `gcTime`: a hydrated entry past its gc window is
// functionally stale and would be discarded on observe anyway.
// Must stay below the 15-min Halo presigned-URL TTL so hydrated
// responses don't surface expired image URLs (TD-034).
export const cacheMaxAge = TEN_MINUTES
