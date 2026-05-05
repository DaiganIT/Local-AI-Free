import { createFileRoute } from '@tanstack/react-router'
import { ChatArea } from '#/components/ChatArea'
import { AgentDetailView } from '#/components/AgentDetailView'

export const Route = createFileRoute('/_layout/hosts/$hostId/a/$agentId/')({
  component: AgentIndexRoute,
})

function AgentIndexRoute() {
  const { agentId, hostId } = Route.useParams()
  const { file } = Route.useSearch()

  return (
    <ChatArea>
      <AgentDetailView agentId={agentId} hostId={hostId} openFilePath={file} />
    </ChatArea>
  )
}
