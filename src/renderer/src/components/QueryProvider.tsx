import { useMemo, type ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { cacheBuster, cacheMaxAge, createPersister, queryClient } from '../api/cache'

export function QueryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const persister = useMemo(() => createPersister(), [])
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: cacheBuster, maxAge: cacheMaxAge }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
