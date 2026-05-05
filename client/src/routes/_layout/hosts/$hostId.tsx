import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/hosts/$hostId')({
  component: HostLayout,
})

function HostLayout() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Outlet />
    </div>
  )
}
