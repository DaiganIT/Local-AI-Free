interface ChatAreaProps {
  children: React.ReactNode
}

export function ChatArea({ children }: ChatAreaProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
      {children}
    </div>
  )
}
