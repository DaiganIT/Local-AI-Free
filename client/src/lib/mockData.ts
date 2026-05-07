import type { HostInfo, AgentInfo, Message } from '#/lib/types'

export const mockHosts: HostInfo[] = [
  {
    id: 'host-1',
    hostname: 'Pietro-MacBook-Pro',
    connectedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
    providers: [{ name: 'ollama', version: '0.9.2' }],
    status: 'online',
    models: [
      { name: 'llama3.2:3b', size: 2036203520, provider: 'ollama' },
      { name: 'phi3:3.8b', size: 2217685504, provider: 'ollama' },
      { name: 'mistral:7b', size: 4108837632, provider: 'ollama' },
    ],
  },
  {
    id: 'host-2',
    hostname: 'dev-linux-box',
    connectedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    lastHeartbeat: new Date(Date.now() - 30000).toISOString(),
    providers: [{ name: 'ollama', version: '0.8.5' }],
    status: 'online',
    models: [
      { name: 'qwen2.5:14b', size: 9012676608, provider: 'ollama' },
      { name: 'codellama:13b', size: 7365826560, provider: 'ollama' },
    ],
  },
  {
    id: 'host-3',
    hostname: 'raspberry-pi',
    connectedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    lastHeartbeat: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    providers: [{ name: 'ollama', version: '0.7.1' }],
    status: 'offline',
    models: [{ name: 'llama3.2:1b', size: 1339369536, provider: 'ollama' }],
  },
]

export const mockAgents: Record<string, AgentInfo[]> = {
  'host-1': [
    {
      id: 'agent-1',
      hostId: 'host-1',
      name: 'Code Assistant',
      status: 'online',
      model: 'llama3.2:3b',
      description: 'General-purpose coding assistant',
    },
    {
      id: 'agent-2',
      hostId: 'host-1',
      name: 'Data Analyst',
      status: 'online',
      model: 'mistral:7b',
      description: 'Specialized in data analysis and visualization',
    },
    {
      id: 'agent-3',
      hostId: 'host-1',
      name: 'Research Bot',
      status: 'idle',
      model: 'phi3:3.8b',
      description: 'Web research and summarization',
    },
  ],
  'host-2': [
    {
      id: 'agent-4',
      hostId: 'host-2',
      name: 'Senior Dev',
      status: 'online',
      model: 'codellama:13b',
      description: 'Full-stack developer specialist',
    },
    {
      id: 'agent-5',
      hostId: 'host-2',
      name: 'Math Solver',
      status: 'idle',
      model: 'qwen2.5:14b',
      description: 'Mathematical reasoning and proofs',
    },
    {
      id: 'agent-6',
      hostId: 'host-2',
      name: 'Bug Hunter',
      status: 'offline',
      model: 'codellama:13b',
      description: 'Automated bug detection and fixing',
    },
  ],
  'host-3': [
    {
      id: 'agent-7',
      hostId: 'host-3',
      name: 'Edge Agent',
      status: 'offline',
      model: 'llama3.2:1b',
      description: 'Lightweight agent for edge computing',
    },
  ],
}

export const mockMessages: Record<string, Message[]> = {
  'agent-1': [
    {
      id: 'msg-1',
      agentId: 'agent-1',
      role: 'user',
      content: 'Hey, can you help me write a REST API in Node.js?',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'msg-2',
      agentId: 'agent-1',
      role: 'assistant',
      content:
        "I'd be happy to help! Let's start with the basics. Are you thinking of using Express or a different framework? I can scaffold a clean project structure with proper error handling and middleware setup.",
      timestamp: new Date(Date.now() - 3590000).toISOString(),
    },
    {
      id: 'msg-3',
      agentId: 'agent-1',
      role: 'user',
      content: 'Express would be great. I need endpoints for users and posts.',
      timestamp: new Date(Date.now() - 3500000).toISOString(),
    },
    {
      id: 'msg-4',
      agentId: 'agent-1',
      role: 'assistant',
      content:
        "Perfect. Here's what I'd suggest for the structure:\n\n```\nsrc/\n├── index.ts          # Entry point\n├── app.ts            # Express app setup\n├── routes/\n│   ├── users.ts\n│   └── posts.ts\n├── controllers/\n│   ├── userController.ts\n│   └── postController.ts\n└── middleware/\n    └── errorHandler.ts\n```\n\nWant me to start with the app setup or dive into a specific route?",
      timestamp: new Date(Date.now() - 3490000).toISOString(),
    },
  ],
  'agent-2': [
    {
      id: 'msg-5',
      agentId: 'agent-2',
      role: 'user',
      content: 'Can you analyze the CSV I uploaded and find trends?',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'msg-6',
      agentId: 'agent-2',
      role: 'assistant',
      content:
        "I'll take a look at the data. From a quick scan, I can see we have monthly sales data spanning 2 years. Here are the key trends I've identified:\n\n1. **Seasonal pattern**: Sales peak in Q4 (Nov-Dec) consistently\n2. **Growth trend**: Year-over-year growth of ~15%\n3. **Anomaly**: Unusual dip in August 2024 that warrants investigation\n\nWould you like me to generate visualizations for any of these?",
      timestamp: new Date(Date.now() - 7180000).toISOString(),
    },
  ],
}
