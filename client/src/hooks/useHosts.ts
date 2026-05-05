import { useQuery } from '@tanstack/react-query'
import type { HostInfo } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useHosts() {
  return useQuery<HostInfo[]>({
    queryKey: ['hosts'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/hosts`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch hosts: ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
    retry: false,
  })
}
