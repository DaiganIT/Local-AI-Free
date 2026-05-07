import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { Bot, ArrowLeft, Loader2 } from 'lucide-react'
import { useHosts, useCreateAgent } from '#/hooks'
import { slugify } from '#/lib/slugify'

export const Route = createFileRoute('/_layout/create-agent')({
  component: CreateAgent,
})

// ── Tool groups ──────────────────────────────────────────────────────────
const ALL_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const
const CODING_TOOLS = ['read', 'bash', 'edit', 'write'] as const
const READONLY_TOOLS = ['read', 'grep', 'find', 'ls'] as const

function CreateAgent() {
  const navigate = useNavigate()
  const { data: hosts } = useHosts()
  const createAgent = useCreateAgent()

  const [name, setName] = useState('')
  const [hostId, setHostId] = useState('')
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [formError, setFormError] = useState('')

  // Default: all 7 tools enabled
  const [enabledTools, setEnabledTools] = useState<Set<string>>(() => new Set(ALL_TOOLS))

  const toggleTool = useCallback((tool: string) => {
    setEnabledTools((prev) => {
      const next = new Set(prev)
      if (next.has(tool)) {
        next.delete(tool)
      } else {
        next.add(tool)
      }
      return next
    })
  }, [])

  const toggleGroup = useCallback((tools: readonly string[], enable: boolean) => {
    setEnabledTools((prev) => {
      const next = new Set(prev)
      for (const t of tools) {
        if (enable) next.add(t)
        else next.delete(t)
      }
      return next
    })
  }, [])

  const codingEnabled = CODING_TOOLS.every((t) => enabledTools.has(t))
  const readonlyEnabled = READONLY_TOOLS.every((t) => enabledTools.has(t))

  const selectedHost = hosts?.find((h) => h.id === hostId)
  const onlineHosts = hosts?.filter((h) => h.status === 'online') ?? []

  const canSubmit =
    name.trim().length > 0 &&
    hostId !== '' &&
    model !== ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!canSubmit) return

    try {
      const tools = enabledTools.size > 0 ? Array.from(enabledTools) : undefined
      await createAgent.mutateAsync({
        hostId,
        name: name.trim(),
        model,
        ...(instructions.trim() && { instructions: instructions.trim() }),
        ...(tools && { tools }),
      })
      navigate({ to: `/hosts/${hostId}` })
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create agent',
      )
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-1 text-[hsl(210_8%_65%)] hover:text-[hsl(210_13%_95%)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-8 py-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-[hsl(200_85%_55%)]/10 border border-[hsl(200_85%_55%)]/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-[hsl(200_85%_55%)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(210_13%_95%)]">
                Create Agent
              </h2>
              <p className="text-sm text-[hsl(210_8%_65%)]">
                Set up a new AI agent on a host
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Agent Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Code Assistant"
                className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm placeholder:text-[hsl(210_6%_40%)] focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition"
                autoFocus
              />
              {name.trim() && (
                <p className="mt-1 text-xs text-[hsl(210_6%_40%)]">
                  alias: <span className="font-mono text-[hsl(210_8%_55%)]">{slugify(name)}</span>
                </p>
              )}
            </div>

            {/* Host Selector */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Host
              </label>
              {onlineHosts.length === 0 ? (
                <div className="px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-sm text-[hsl(210_8%_50%)]">
                  No online hosts available
                </div>
              ) : (
                <select
                  value={hostId}
                  onChange={(e) => {
                    setHostId(e.target.value)
                    setModel('')
                  }}
                  className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition appearance-none cursor-pointer"
                >
                  <option value="" disabled>
                    Select a host...
                  </option>
                  {onlineHosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.hostname}{' '}
                      {h.providers.length > 0 ? `(${h.providers.map(p => p.name).join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Model Selector */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Model
              </label>
              {!selectedHost ? (
                <div className="px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-sm text-[hsl(210_6%_40%)]">
                  Select a host first
                </div>
              ) : selectedHost.models.length === 0 ? (
                <div className="px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-sm text-[hsl(210_8%_50%)]">
                  No models on this host
                </div>
              ) : (
                <select
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value)
                  }}
                  className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition appearance-none cursor-pointer"
                >
                  <option value="" disabled>
                    Select a model...
                  </option>
                  {selectedHost.models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}{' '}
                      <span className="text-[hsl(210_6%_40%)]">
                        {formatSize(m.size)}
                      </span>
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Instructions <span className="text-[hsl(210_6%_40%)] normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. You are a helpful coding assistant..."
                rows={4}
                className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm placeholder:text-[hsl(210_6%_40%)] focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition resize-none"
              />
            </div>

            {/* Tools */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-2">
                Tools
              </label>
              {/* Preset buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(CODING_TOOLS, !codingEnabled)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                    codingEnabled
                      ? 'bg-[hsl(200_85%_55%)]/15 border-[hsl(200_85%_55%)]/30 text-[hsl(200_85%_65%)]'
                      : 'bg-[hsl(208_25%_14%)] border-[hsl(208_25%_18%)] text-[hsl(210_6%_40%)] hover:border-[hsl(208_25%_25%)]'
                  }`}
                >
                  Coding Tools
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(READONLY_TOOLS, !readonlyEnabled)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                    readonlyEnabled
                      ? 'bg-[hsl(200_85%_55%)]/15 border-[hsl(200_85%_55%)]/30 text-[hsl(200_85%_65%)]'
                      : 'bg-[hsl(208_25%_14%)] border-[hsl(208_25%_18%)] text-[hsl(210_6%_40%)] hover:border-[hsl(208_25%_25%)]'
                  }`}
                >
                  Read-only Tools
                </button>
              </div>
              {/* Individual tool checkboxes */}
              <div className="flex flex-wrap gap-2">
                {ALL_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all border ${
                      enabledTools.has(tool)
                        ? 'bg-[hsl(200_85%_55%)]/10 border-[hsl(200_85%_55%)]/25 text-[hsl(200_85%_65%)]'
                        : 'bg-[hsl(208_25%_14%)] border-[hsl(208_25%_18%)] text-[hsl(210_6%_40%)] hover:border-[hsl(208_25%_25%)]'
                    }`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                {formError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || createAgent.isPending}
              className={`w-full py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2
                ${
                  canSubmit && !createAgent.isPending
                    ? 'bg-[hsl(200_85%_55%)] hover:bg-[hsl(200_85%_50%)] text-white'
                    : 'bg-[hsl(208_25%_18%)] text-[hsl(210_6%_40%)] cursor-not-allowed'
                }
              `}
            >
              {createAgent.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" />
                  Create Agent
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `(${(bytes / 1_000_000_000).toFixed(1)} GB)`
  }
  if (bytes >= 1_000_000) {
    return `(${(bytes / 1_000_000).toFixed(0)} MB)`
  }
  return `(${bytes} B)`
}
