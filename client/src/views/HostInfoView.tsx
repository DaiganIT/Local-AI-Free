import { useHosts, useAgents } from '#/hooks'
import { Server, Clock, Activity, Cpu } from 'lucide-react'
import { formatRelativeTime, formatBytes } from '../lib/formatting'
import { CapabilityBadge } from '#/components/CapabilityBadge'

export function HostInfoView({ hostId }: { hostId: string }) {
  const { data: hosts } = useHosts()
  const { data: agents } = useAgents()
  const host = hosts?.find((h) => h.id === hostId)
  const hostAgents = agents?.filter((a) => a.hostId === hostId) ?? []

  if (!host) return <div className="flex-1 min-h-0" />

  const connectedSince = new Date(host.connectedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const lastSeen = formatRelativeTime(host.lastHeartbeat)
  const totalModelSize = host.models.reduce((sum, m) => sum + m.size, 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
        <Server className="w-5 h-5 text-[hsl(210_8%_50%)] mr-2" />
        <span className="font-semibold text-[hsl(210_13%_95%)]">
          {host.hostname}
        </span>
        <span
          className={`ml-2 text-xs ${host.status === 'online' ? 'text-[hsl(153_46%_49%)]' : 'text-[hsl(210_6%_40%)]'}`}
        >
          {host.status === 'online' && '● '}
          {host.status}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Connection details */}
        <section>
          <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider mb-3">
            Connection
          </h3>
          <div className="space-y-2">
            <InfoRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Connected since"
              value={connectedSince}
            />
            <InfoRow
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Last heartbeat"
              value={lastSeen}
            />
            <InfoRow
              icon={<Cpu className="w-3.5 h-3.5" />}
              label="Ollama version"
              value={host.ollamaVersion}
            />
          </div>
        </section>

        {/* Models */}
        <section>
          <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider mb-3">
            Models ({host.models.length})
          </h3>
          <div className="rounded-lg border border-[hsl(208_25%_14%)] overflow-hidden">
            {host.models.map((model, i) => (
              <div
                key={model.name}
                className={`px-3 py-2.5 text-sm ${i > 0 ? 'border-t border-[hsl(208_25%_14%)]' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[hsl(210_13%_95%)]">
                    {model.name}
                  </span>
                  <span className="text-[hsl(210_8%_65%)] text-xs">
                    {formatBytes(model.size)}
                  </span>
                </div>
                {model.capabilities && model.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {model.capabilities.map((cap) => (
                      <CapabilityBadge key={cap} capability={cap} variant="compact" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-[hsl(210_8%_65%)]">
            Total: {formatBytes(totalModelSize)}
          </div>
        </section>

        {/* Agents */}
        <section>
          <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider mb-3">
            Agents ({hostAgents.length})
          </h3>
          <div className="space-y-1.5">
            {hostAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agent.status === 'online'
                        ? 'bg-[hsl(153_46%_49%)]'
                        : agent.status === 'idle'
                          ? 'bg-[hsl(38_100%_58%)]'
                          : 'bg-[hsl(210_6%_40%)]'
                    }`}
                  />
                  <span className="text-sm font-medium text-[hsl(210_13%_95%)]">
                    {agent.name}
                  </span>
                </div>
                <span className="text-xs font-mono text-[hsl(210_8%_65%)]">
                  {agent.model}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5">
      <div className="flex items-center gap-2 text-[hsl(210_8%_65%)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-medium text-[hsl(210_13%_95%)]">
        {value}
      </span>
    </div>
  )
}
