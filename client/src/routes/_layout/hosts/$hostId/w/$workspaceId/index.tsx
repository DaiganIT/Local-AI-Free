import { createFileRoute } from '@tanstack/react-router'
import { ChatArea } from '#/components/ChatArea'
import { WorkspaceView } from '#/views/WorkspaceView'

export const Route = createFileRoute('/_layout/hosts/$hostId/w/$workspaceId/')({
  component: WorkspaceIndexRoute,
})

function WorkspaceIndexRoute() {
  const { workspaceId, hostId } = Route.useParams()

  return (
    <ChatArea>
      <WorkspaceView workspaceId={workspaceId} hostId={hostId} />
    </ChatArea>
  )
}
