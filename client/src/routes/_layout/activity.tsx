import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'

export const Route = createFileRoute('/_layout/activity')({
  component: RecentActivity,
})

function RecentActivity() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
        <Activity className="w-5 h-5 text-[hsl(210_8%_50%)] mr-2" />
        <span className="font-semibold text-[hsl(210_13%_95%)]">
          Recent Activity
        </span>
      </header>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center px-8">
          <div className="w-14 h-14 rounded-full bg-[hsl(200_85%_55%)]/10 border border-[hsl(200_85%_55%)]/20 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-7 h-7 text-[hsl(200_85%_55%)]/60" />
          </div>
          <h3 className="text-base font-semibold text-[hsl(210_13%_95%)] mb-1">
            No recent activity
          </h3>
          <p className="text-sm text-[hsl(210_8%_65%)] max-w-xs">
            Activity from all connected hosts will appear here once the relay is
            online.
          </p>
        </div>
      </div>
    </div>
  )
}
