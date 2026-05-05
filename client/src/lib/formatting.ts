export function formatTokenCount(val: number): string {
  return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${val}`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(1)} ${units[i]}`
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatContextUsage({ totalTokens, contextWindow }: { totalTokens?: number; contextWindow?: number }): string | null {
  if (totalTokens === undefined || totalTokens === null) return null
  if (contextWindow === undefined || contextWindow === null) return null
  if (contextWindow === 0) return null
  return `${Math.min(Math.round((totalTokens / contextWindow) * 100), 100)}%`
}
