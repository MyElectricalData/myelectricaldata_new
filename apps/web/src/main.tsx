import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
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
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Don't persist auth-related queries to avoid session issues
            const queryKey = query.queryKey[0] as string
            return queryKey !== 'user' && queryKey !== 'admin-users'
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
    </PersistQueryClientProvider>
  </React.StrictMode>
)
