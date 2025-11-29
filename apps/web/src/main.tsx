import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'
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

// Create persister for IndexedDB to persist React Query cache across page reloads
// Using IndexedDB instead of localStorage to handle large data (detail queries ~3MB each)
// IndexedDB has much higher limits (~50MB-1GB) compared to localStorage (~5-10MB)
const persister = {
  persistClient: async (client: any) => {
    await set('myelectricaldata-query-cache', client)
  },
  restoreClient: async () => {
    return await get('myelectricaldata-query-cache')
  },
  removeClient: async () => {
    await del('myelectricaldata-query-cache')
  },
}

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

            // Don't persist PDL list - it changes frequently (consent, add, delete)
            // and must always be fresh from the server
            if (queryKey === 'pdls') {
              return false
            }

            // Don't persist energy providers/offers - they change when scrapers run
            // and must always be fresh from the server to avoid stale cache issues
            if (queryKey === 'energy-providers' || queryKey === 'energy-offers') {
              return false
            }

            // Always persist detail queries if they have data
            // Using IndexedDB persister to handle large data (~3MB per query)
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
