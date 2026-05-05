import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't refetch automatically on window focus in SSR
        staleTime: 1000 * 60, // 1 minute - data stays fresh
        gcTime: 1000 * 60 * 5, // 5 minutes - garbage collection
        retry: 3,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // AbortSignal will be passed through queryFn context
      },
      mutations: {
        retry: 1,
      },
    },
  })
}

// Singleton for client-side to avoid creating new clients on HMR
let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // SSR: always create a new client
    return makeQueryClient()
  } else {
    // Browser: reuse existing client
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient()
    }
    return browserQueryClient
  }
}
