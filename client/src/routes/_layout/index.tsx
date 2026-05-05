import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'

export const Route = createFileRoute('/_layout/')({
  component: Welcome,
})

function Welcome() {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-[hsl(200_85%_55%)]/10 border border-[hsl(200_85%_55%)]/20 flex items-center justify-center mb-5">
        <Bot className="w-10 h-10 text-[hsl(200_85%_55%)]" />
      </div>
      <h2 className="text-xl font-bold text-[hsl(210_13%_95%)] mb-2">
        Welcome to Local LLM Tinkerer
      </h2>
      <p className="text-sm text-[hsl(210_8%_65%)] max-w-sm leading-relaxed">
        Select a host from the left panel, then choose an agent to start
        chatting. All AI models are running on your local machines.
      </p>
    </div>
  )
}
