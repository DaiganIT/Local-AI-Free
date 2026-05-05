import { createFileRoute, Outlet } from '@tanstack/react-router'
import { z } from 'zod'

/** Search params shared by all routes under /hosts/:hostId/a/:agentId */
const agentSearchSchema = z.object({
  /** Workspace-relative path of the file to open in the artifact panel. */
  file: z.string().optional(),
})

export type AgentSearch = z.infer<typeof agentSearchSchema>

export const Route = createFileRoute('/_layout/hosts/$hostId/a/$agentId')({
  validateSearch: agentSearchSchema,
  component: AgentLayout,
})

function AgentLayout() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Outlet />
    </div>
  )
}
