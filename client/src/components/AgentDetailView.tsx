import { useNavigate } from '@tanstack/react-router'
import { useAgent, useDeleteAgent, useAgentInstructions, useHosts } from '#/hooks'
import { useDeleteAgentFile } from '#/hooks/useDeleteFile'
import { nav } from '#/lib/navigation'
import { AgentWorkspaceExplorer } from '#/components/AgentWorkspaceExplorer'
import { ArtifactPanel } from '#/components/ArtifactPanel'
import { CapabilityBadge } from '#/components/CapabilityBadge'
import { useEffect, useState } from 'react'

interface AgentDetailViewProps {
  agentId: string
  hostId: string
  /** Currently-open workspace-relative file path (from URL search). */
  openFilePath?: string
}

export function AgentDetailView({ agentId, hostId, openFilePath }: AgentDetailViewProps) {
  const { data: agent, isLoading } = useAgent(agentId)
  const { data: instructionsData } = useAgentInstructions(agentId)
  const { data: hosts } = useHosts()
  const navigate = useNavigate()
  const deleteAgent = useDeleteAgent()
  const deleteFile = useDeleteAgentFile(agentId)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!isLoading && agent) {
      const t = requestAnimationFrame(() => setRevealed(true))
      return () => cancelAnimationFrame(t)
    }
    setRevealed(false)
  }, [isLoading, agent])

  async function handleDelete() {
    if (!agent) return
    await deleteAgent.mutateAsync(agent.id)
    navigate({ to: nav.host(hostId) })
  }

  if (isLoading || !agent) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-discord-primary border-t-transparent animate-spin" />
          <span className="text-xs font-mono tracking-wider text-[hsl(210_8%_45%)] uppercase">Initializing</span>
        </div>
      </div>
    )
  }

  const tools = agent.tools ?? []
  const skills = agent.skills ?? []
  const host = hosts?.find((h) => h.id === hostId)
  const modelCapabilities = host?.models.find((m) => m.name === agent.model)?.capabilities

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-discord-border-subtle">
        <div className="max-w-3xl w-full mx-auto">

          {/* ── Hero Header ── */}
          <div className={`relative overflow-hidden px-6 pt-10 pb-8 transition-all duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}>
            {/* Grid overlay texture */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(hsl(200_85%_55%) 1px, transparent 1px), linear-gradient(90deg, hsl(200_85%_55%) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            {/* Radial glow behind avatar */}
            <div className="absolute top-4 left-8 w-40 h-40 rounded-full bg-discord-primary/5 blur-3xl pointer-events-none" />

            <div className="relative flex items-start gap-5">
              {/* Avatar with status ring */}
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-discord-surface border border-discord-border flex items-center justify-center relative z-10">
                  <span className="text-2xl font-bold text-discord-primary tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                {/* Status ring */}
                <div className={`absolute -inset-1 rounded-[18px] border-2 transition-colors duration-700 ${
                  agent.providerOnline === true
                    ? 'border-discord-green/40 status-ping'
                    : agent.providerOnline === false
                    ? 'border-discord-red/40'
                    : 'border-discord-text-muted/20'
                }`} />
              </div>

              <div className="min-w-0 flex-1 pt-1">
                <h1 className="text-2xl font-bold text-discord-text tracking-tight leading-none">{agent.name}</h1>
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono text-discord-text-dim bg-discord-surface px-2 py-0.5 rounded border border-discord-border">
                    <span className="w-1.5 h-1.5 rounded-full bg-discord-primary" />
                    {agent.model}
                  </span>
                  {agent.alias && (
                    <span className="text-[11px] font-mono text-discord-text-muted tracking-wide">
                      @{agent.alias}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest ${
                    agent.providerOnline === true ? 'text-discord-green' : agent.providerOnline === false ? 'text-discord-red' : 'text-discord-text-muted'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      agent.providerOnline === true ? 'bg-discord-green' : agent.providerOnline === false ? 'bg-discord-red' : 'bg-discord-text-muted'
                    }`} />
                    {agent.providerOnline === true ? 'available' : agent.providerOnline === false ? 'unavailable' : 'unknown'}
                  </span>
                  {agent.provider && (
                    <span className="text-[10px] font-mono text-discord-text-muted bg-discord-surface px-1.5 py-0.5 rounded border border-discord-border">
                      via {agent.provider}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0 pt-1">
                <button
                  onClick={handleDelete}
                  disabled={deleteAgent.isPending}
                  className="group p-2 rounded-lg text-discord-text-muted hover:text-discord-red hover:bg-discord-red/10 transition-all duration-200 cursor-pointer disabled:opacity-50"
                  title="Delete agent"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 pb-10 space-y-8">
            {/* ── Instructions ── */}
            {instructionsData?.instructions && (
              <DetailSection title="Instructions" revealed={revealed} delay={1}>
                <div className="rounded-lg bg-discord-surface border border-discord-border p-4 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-discord-primary/40" />
                  <p className="text-sm text-discord-text/80 whitespace-pre-wrap leading-relaxed pl-3">
                    {instructionsData.instructions}
                  </p>
                </div>
              </DetailSection>
            )}

            {/* ── Model Info ── */}
            <DetailSection title="Model Info" revealed={revealed} delay={2}>
              <div className="grid grid-cols-3 gap-px bg-discord-border rounded-lg overflow-hidden">
                <StatCell label="Model" value={agent.model} monospace />
                <StatCell label="Alias" value={agent.alias ?? '—'} monospace />
                <StatCell label="Provider" value="Ollama" />
              </div>
              {modelCapabilities && modelCapabilities.length > 0 && (
                <div className="mt-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.15em] text-discord-text-muted mb-2.5 font-semibold">Capabilities</div>
                  <div className="flex flex-wrap gap-2">
                    {modelCapabilities.map((cap) => (
                      <CapabilityBadge key={cap} capability={cap} />
                    ))}
                  </div>
                </div>
              )}
            </DetailSection>

            {/* ── Tools ── */}
            {tools.length > 0 && (
              <DetailSection title="Tools" revealed={revealed} delay={3}>
                <div className="grid grid-cols-2 gap-2">
                  {tools.map((tool) => (
                    <div
                      key={tool}
                      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-discord-surface border border-discord-border hover:border-discord-primary/30 transition-colors duration-200"
                    >
                      <div className="w-5 h-5 rounded bg-discord-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-discord-primary/20 transition-colors">
                        <WrenchIcon />
                      </div>
                      <span className="text-sm font-mono text-discord-text-dim group-hover:text-discord-primary transition-colors truncate">
                        {tool}
                      </span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* ── Skills ── */}
            {skills.length > 0 && (
              <DetailSection title="Skills" revealed={revealed} delay={4}>
                <div className="space-y-2">
                  {skills.map((skill) => (
                    <SkillRow key={skill.name} name={skill.name} description={skill.description} />
                  ))}
                </div>
              </DetailSection>
            )}
          </div>
        </div>
      </div>

      {openFilePath ? (
        <ArtifactPanel mode="agent" agentId={agentId} hostId={hostId} filePath={openFilePath} />
      ) : null}

      <aside className={`workspace-rail relative flex min-h-56 w-full shrink-0 flex-col border-l border-discord-border-subtle bg-discord-bg shadow-[inset_1px_0_0_hsl(200_85%_55%/18%),-18px_0_48px_-24px_rgb(0_0_0/0.52)] ${
        openFilePath ? 'md:min-h-0 md:w-56 xl:w-64' : 'md:min-h-0 md:w-80 xl:w-[22rem]'
      }`}>
        <AgentWorkspaceExplorer agentId={agentId} hostId={hostId} openFilePath={openFilePath} onDeleteFile={(nodeId) => {
          deleteFile.mutate({ path: nodeId }, {
            onSuccess: () => {
              if (openFilePath === nodeId) {
                navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, file: undefined }) })
              }
            },
          })
        }} />
      </aside>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DetailSection({ title, children, revealed, delay }: { title: string; children: React.ReactNode; revealed: boolean; delay: number }) {
  return (
    <div
      className={`transition-all duration-500 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
      style={{ transitionDelay: revealed ? `${delay * 80}ms` : '0ms' }}
    >
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-discord-text-muted mb-3 flex items-center gap-2">
        <span className="w-3 h-px bg-discord-text-muted/40" />
        {title}
      </h2>
      {children}
    </div>
  )
}

function StatCell({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="bg-discord-surface px-4 py-3">
      <div className="text-[0.6rem] uppercase tracking-[0.15em] text-discord-text-muted mb-1 font-semibold">
        {label}
      </div>
      <div className={`text-sm font-semibold text-discord-text truncate ${monospace ? 'font-mono text-[13px]' : ''}`}>{value}</div>
    </div>
  )
}

function SkillRow({ name, description }: { name: string; description: string }) {
  return (
    <div className="group rounded-lg bg-discord-surface border border-discord-border px-4 py-3 flex items-start gap-3 hover:border-discord-primary/25 transition-colors duration-200 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-discord-primary/30 group-hover:bg-discord-primary/60 transition-colors" />
      <div className="mt-0.5 w-5 h-5 rounded bg-discord-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-discord-primary/20 transition-colors">
        <WrenchIcon />
      </div>
      <div className="min-w-0 pl-2">
        <div className="text-sm font-medium text-discord-text">{name}</div>
        <div className="text-xs text-discord-text-dim mt-0.5 leading-relaxed">{description}</div>
      </div>
    </div>
  )
}

function WrenchIcon() {
  return (
    <svg className="w-3 h-3 text-discord-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
    </svg>
  )
}
