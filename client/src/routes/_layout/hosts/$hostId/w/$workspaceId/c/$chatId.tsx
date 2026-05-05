import { createFileRoute } from '@tanstack/react-router'
import { ChatArea } from '#/components/ChatArea'
import { WorkspaceChatView } from '#/views/WorkspaceChatView'

export const Route = createFileRoute('/_layout/hosts/$hostId/w/$workspaceId/c/$chatId')({
  component: WorkspaceChatRoute,
})

function WorkspaceChatRoute() {
  const { hostId, workspaceId, chatId } = Route.useParams()
  const { file } = Route.useSearch()

  return (
    <ChatArea>
      <WorkspaceChatView
        workspaceId={workspaceId}
        hostId={hostId}
        chatId={chatId}
        openFilePath={file}
      />
    </ChatArea>
  )
}
