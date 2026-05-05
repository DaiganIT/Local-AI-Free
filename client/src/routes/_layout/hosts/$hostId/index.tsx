import { createFileRoute } from '@tanstack/react-router'
import { ChatArea } from '#/components/ChatArea'
import { HostInfoView } from '#/views/HostInfoView'

export const Route = createFileRoute('/_layout/hosts/$hostId/')({
  component: HostInfoRoute,
})

function HostInfoRoute() {
  const { hostId } = Route.useParams()

  return (
    <ChatArea>
      <HostInfoView hostId={hostId} />
    </ChatArea>
  )
}
