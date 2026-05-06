import { Save } from 'lucide-react'

interface SaveBarProps {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  extra?: React.ReactNode
}

export function SaveBar({ isDirty, isSaving, onSave, extra }: SaveBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[hsl(208_25%_12%)] px-4 py-1.5">
      <div className="flex items-center gap-2">
        {isDirty && (
          <span className="animate-pulse text-[0.65rem] text-discord-primary">● Modified</span>
        )}
        {extra}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || !isDirty}
        className="flex items-center gap-1.5 rounded-md border border-[hsl(200_85%_45%/25%)] bg-[hsl(200_85%_45%/15%)] px-3 py-1 text-xs font-medium text-[hsl(200_85%_65%)] transition-colors hover:bg-[hsl(200_85%_45%/25%)] disabled:cursor-default disabled:opacity-40"
      >
        <Save className="h-3 w-3" strokeWidth={2} />
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
