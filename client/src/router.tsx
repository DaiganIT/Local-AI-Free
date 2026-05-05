import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    context: {
      queryClient: new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,           // 1 minute
            gcTime: 1000 * 60 * 5,           // 5 minutes
            retry: 3,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

// Access to queryClient from route context
declare module '@tanstack/react-router' {
  interface RouteContext {
    queryClient: QueryClient
  }
}
