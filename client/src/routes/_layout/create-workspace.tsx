import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { FolderOpen, ArrowLeft, Loader2 } from 'lucide-react'
import { useHosts, useHostAgents, useCreateWorkspace, useAddAgentToWorkspace } from '#/hooks'
import { slugify } from '#/lib/slugify'

export const Route = createFileRoute('/_layout/create-workspace')({
  component: CreateWorkspace,
})

function CreateWorkspace() {
  const navigate = useNavigate()
  const { data: hosts } = useHosts()
  const createWorkspace = useCreateWorkspace()
  const addAgentToWorkspace = useAddAgentToWorkspace()

  const [name, setName] = useState('')
  const [hostId, setHostId] = useState('')
  const [pathOverride, setPathOverride] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState('')

  const onlineHosts = hosts?.filter((h) => h.status === 'online') ?? []

  // Auto-suggest path from name, but allow manual override
  const suggestedPath = slugify(name)
  const path = pathOverride ?? suggestedPath

  // Fetch agents for the selected host
  const { data: hostAgents } = useHostAgents(hostId)

  const canSubmit =
    name.trim().length > 0 &&
    hostId !== '' &&
    path.length > 0

  const handlePathChange = (value: string) => {
    setPathOverride(value)
  }

  // When name changes and user hasn't manually overridden path, keep auto-suggesting
  const handleNameChange = (value: string) => {
    setName(value)
    // Reset path override so it re-syncs with the new name
    if (pathOverride !== null) {
      setPathOverride(null)
    }
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!canSubmit) return

    try {
      const workspace = await createWorkspace.mutateAsync({
        hostId,
        name: name.trim(),
        path: path || undefined,
      })

      // Add selected agents to the workspace
      const agentPromises = Array.from(selectedAgents).map((agentId) =>
        addAgentToWorkspace.mutateAsync({
          workspaceId: workspace.id,
          agentId,
          hostId,
        }),
      )
      await Promise.all(agentPromises)

      navigate({ to: `/hosts/${hostId}` })
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create workspace',
      )
    }
  }

  const isSubmitting = createWorkspace.isPending || addAgentToWorkspace.isPending

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
              <FolderOpen className="w-6 h-6 text-[hsl(200_85%_55%)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(210_13%_95%)]">
                Create Workspace
              </h2>
              <p className="text-sm text-[hsl(210_8%_65%)]">
                Set up a new shared workspace on a host
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Workspace Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Project Alpha"
                className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm placeholder:text-[hsl(210_6%_40%)] focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition"
                autoFocus
              />
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
                    setSelectedAgents(new Set())
                  }}
                  className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition appearance-none cursor-pointer"
                >
                  <option value="" disabled>
                    Select a host...
                  </option>
                  {onlineHosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.hostname}{' '}
                      {h.ollamaVersion ? `(${h.ollamaVersion})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Path */}
            <div>
              <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-1.5">
                Path
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder="auto-generated from name"
                className="w-full px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-[hsl(210_13%_95%)] text-sm font-mono placeholder:text-[hsl(210_6%_40%)] focus:outline-none focus:ring-1 focus:ring-[hsl(200_85%_55%)]/50 focus:border-[hsl(200_85%_55%)]/50 transition"
              />
              <p className="mt-1 text-xs text-[hsl(210_6%_40%)]">
                Relative to <span className="font-mono text-[hsl(210_8%_55%)]">.workspaces/</span> on the host
              </p>
            </div>

            {/* Agent Multi-select */}
            {hostId && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(210_8%_65%)] uppercase tracking-wider mb-2">
                  Agents{' '}
                  <span className="text-[hsl(210_6%_40%)] normal-case tracking-normal">
                    (optional)
                  </span>
                </label>
                {!hostAgents || hostAgents.length === 0 ? (
                  <div className="px-3 py-2 bg-[hsl(208_25%_14%)] border border-[hsl(208_25%_18%)] rounded-md text-sm text-[hsl(210_8%_50%)]">
                    No agents on this host
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                    {hostAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => toggleAgent(agent.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all border text-left ${
                          selectedAgents.has(agent.id)
                            ? 'bg-[hsl(200_85%_55%)]/10 border-[hsl(200_85%_55%)]/25 text-[hsl(200_85%_65%)]'
                            : 'bg-[hsl(208_25%_14%)] border-[hsl(208_25%_18%)] text-[hsl(210_8%_65%)] hover:border-[hsl(208_25%_25%)]'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            selectedAgents.has(agent.id)
                              ? 'bg-[hsl(200_85%_55%)] border-[hsl(200_85%_55%)]'
                              : 'border-[hsl(208_25%_25%)]'
                          }`}
                        >
                          {selectedAgents.has(agent.id) && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{agent.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {formError && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                {formError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className={`w-full py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2
                ${
                  canSubmit && !isSubmitting
                    ? 'bg-[hsl(200_85%_55%)] hover:bg-[hsl(200_85%_50%)] text-white'
                    : 'bg-[hsl(208_25%_18%)] text-[hsl(210_6%_40%)] cursor-not-allowed'
                }
              `}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderOpen className="w-4 h-4" />
                  Create Workspace
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
