import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep data in cache for a week
      staleTime: 1000 * 60 * 60, // 1 hour - consider data fresh for 1 hour
    },
  },
})

const persister = experimental_createQueryPersister({
  storage: window.localStorage,
  key: 'myelectricaldata-cache',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
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
