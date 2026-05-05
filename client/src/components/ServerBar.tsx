import { useQuery } from '@tanstack/react-query'
import { useHosts } from '#/hooks'
import { Zap } from 'lucide-react'

interface ServerBarProps {
  onSelectHost: (hostId: string | null) => void
  selectedHostId: string | null
}

export function ServerBar({ onSelectHost, selectedHostId }: ServerBarProps) {
  const { data: hosts } = useHosts()
  const sortedHosts = (hosts ?? []).slice().sort((a, b) => {
    if (a.status === 'online' && b.status !== 'online') return -1
    if (a.status !== 'online' && b.status === 'online') return 1
    return a.hostname.localeCompare(b.hostname)
  })

  return (
    <nav className="flex flex-col items-center gap-2 py-3 w-[64px] bg-[hsl(208_25%_6%)] flex-shrink-0 overflow-y-auto">
      {/* Home button */}
      <button
        onClick={() => onSelectHost(null)}
        className={`group relative w-12 h-12 rounded-[24px] transition-all duration-300 flex items-center justify-center cursor-pointer
          ${
            selectedHostId === null
              ? 'bg-[hsl(235_86%_65%)] rounded-[16px]'
              : 'bg-[hsl(208_25%_16%)] hover:bg-[hsl(235_86%_65%)] hover:rounded-[16px]'
          }`}
      >
        <Zap className="w-5 h-5 text-white" />
      </button>

      <div className="w-8 h-[1px] bg-[hsl(208_25%_18%)] rounded-full" />

      {/* Host list */}
      {sortedHosts.map((host) => {
        const isSelected = selectedHostId === host.id
        const isOnline = host.status === 'online'

        return (
          <button
            key={host.id}
            onClick={() => onSelectHost(host.id)}
            title={host.hostname}
            className={`group relative w-12 h-12 rounded-[24px] transition-all duration-300 flex items-center justify-center cursor-pointer text-sm font-semibold overflow-hidden
              ${
                isSelected
                  ? 'bg-[hsl(200_85%_55%)] rounded-[16px] text-white'
                  : 'bg-[hsl(208_25%_16%)] hover:bg-[hsl(200_85%_55%)] hover:rounded-[16px] hover:text-white text-[hsl(210_8%_65%)]'
              }`}
          >
            {/* Avatar letter */}
            {host.hostname.charAt(0).toUpperCase()}

            {/* Online indicator */}
            <span
              className={`absolute bottom-0.5 right-0.5 w-[10px] h-[10px] rounded-full border-[2px] border-[hsl(208_25%_6%)]
                ${isOnline ? 'bg-[hsl(153_46%_49%)]' : 'bg-[hsl(210_6%_40%)]'}`}
            />
          </button>
        )
      })}

      {/* Add server placeholder */}
      <button
        className="w-12 h-12 rounded-[24px] bg-[hsl(208_25%_16%)] hover:bg-[hsl(153_46%_30%)] hover:rounded-[16px] transition-all duration-300 flex items-center justify-center text-[hsl(153_46%_49%)] hover:text-white cursor-pointer"
        title="Add a host"
      >
        <span className="text-2xl font-light leading-none">+</span>
      </button>
    </nav>
  )
}
