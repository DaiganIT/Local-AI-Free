import { createFileRoute } from '@tanstack/react-router'
import { ChatArea } from '#/components/ChatArea'
import { ChatView } from '#/views/ChatView'

export const Route = createFileRoute('/_layout/hosts/$hostId/a/$agentId/c/$chatId')({
  component: ChatRoute,
})

function ChatRoute() {
  const { hostId, agentId, chatId } = Route.useParams()
  const search = Route.useSearch()
  const file = (search as Record<string, unknown>).file as string | undefined

  return (
    <ChatArea>
      <ChatView agentId={agentId} chatId={chatId} hostId={hostId} openFilePath={file} />
    </ChatArea>
  )
}
