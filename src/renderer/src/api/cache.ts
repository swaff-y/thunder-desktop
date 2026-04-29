import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const FIVE_MINUTES = 5 * 60 * 1000
const FIFTEEN_MINUTES = 15 * 60 * 1000

// React Query client with the same defaults web-thunder uses so query
// behavior is byte-identical across web and desktop.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FIVE_MINUTES,
      gcTime: FIFTEEN_MINUTES,
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
// Aligns with `gcTime` per TD-008: a hydrated entry past its gc window
// is functionally stale and would be discarded on observe anyway.
export const cacheMaxAge = FIFTEEN_MINUTES
