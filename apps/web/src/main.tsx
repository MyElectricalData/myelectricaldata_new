import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep data in cache for one day
      staleTime: 1000 * 60 * 60 * 24, // 24 hours - consider data fresh for one day
    },
  },
})

// Create persister for localStorage to persist React Query cache across page reloads
// Exclude auth-related queries from persistence to avoid session issues
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'myelectricaldata-query-cache',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days - keep persisted data for one week
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const queryKey = query.queryKey[0] as string

            // Don't persist auth-related queries to avoid session issues
            if (queryKey === 'user' || queryKey === 'admin-users') {
              return false
            }

            // Always persist detail queries if they have data
            // (data is populated via setQueryData by useUnifiedDataFetch)
            // Check if query has data regardless of status (queryFn returns null, data comes from setQueryData)
            if (queryKey === 'consumptionDetail' || queryKey === 'productionDetail') {
              return query.state.data != null
            }

            // Persist other queries only if they have data
            return query.state.status === 'success'
          }
        }
      }}
    >
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <App />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  </React.StrictMode>
)
