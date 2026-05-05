import { createFileRoute, Outlet } from '@tanstack/react-router'
import { z } from 'zod'

/** Search params shared by all routes under /hosts/:hostId/w/:workspaceId */
const workspaceSearchSchema = z.object({
  /** Workspace-relative path of the file to open in the artifact panel. */
  file: z.string().optional(),
})

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>

export const Route = createFileRoute('/_layout/hosts/$hostId/w/$workspaceId')({
  validateSearch: workspaceSearchSchema,
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Outlet />
    </div>
  )
}
