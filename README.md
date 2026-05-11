# Local AI Free

An open-source relay system that lets you chat with local AI models through a web browser — from any device. No cloud APIs, no subscriptions, completely free.

```
┌──────────┐       ┌───────────┐       ┌──────────┐
│  Browser │◄─────►│  Server    │◄─────►│ AI Host  │◄──► AI Model
│  (React) │  HTTP │  (Relay)   │  WS   │ (Agent)  │
└──────────┘       └───────────┘       └──────────┘
```

- **client/** — React web app (TanStack Router, Vite). Browse hosts, send messages, manage AI agents.
- **server/** — Node.js relay (Express + WebSocket). Bridges browser clients and AI hosts.
- **llm-host/** — Node.js agent that connects to the server, registers itself, and runs AI agents via Ollama.

## Why Local AI Free?

Cloud AI APIs cost money. Your own hardware is free. Local AI Free lets you:

- Run AI models on your own hardware (no latency, no costs, full privacy)
- Connect from any device — your phone, tablet, or a different machine
- Manage multiple AI hosts and their models from a single dashboard
- Create AI agents that can read files, run code, and perform tasks

## Prerequisites

- **Node.js** 20+ and npm
- **[Ollama](https://ollama.com)** — install from https://ollama.com/download, then pull a model (e.g. `ollama pull llama3.2`)

## Quick Start

```bash
# Clone the repo
git clone <repo-url>
cd local-ai-free

# Install dependencies for all packages
npm install

# 1. Start the relay server
npm run dev:server

# 2. In another terminal, start the AI host
npm run dev:host

# 3. In another terminal, start the web client
npm run dev:client
```

Then open http://localhost:4000 in your browser.

## Configuration

Each component uses `.env` files for configuration. Copy the example files to get started:

### Server (`server/`)

```bash
cp server/.env.example server/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP + WebSocket port |
| `SERVER_API_KEYS` | _(none)_ | Comma-separated API keys. If set, clients must send `X-API-Key` header. |

### AI Host (`llm-host/`)

```bash
cp llm-host/.env.example llm-host/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_URL` | `ws://localhost:3000/ws/host` | WebSocket URL of the relay server |
| `API_KEY` | _(empty)_ | API key to authenticate with the server |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `AGENTS_DB` | `agents.db` | Path to the SQLite database |
| `AGENT_FOLDER_BASE_PATH` | _(none)_ | Base path for agent workspace folders |

### Client (`client/`)

```bash
cp client/.env.example client/.env   # (or just create client/.env)
```

| Variable | Default | Description |
|----------|---------|------------- |
| `VITE_RELAY_URL` | `http://localhost:3000` | Relay server URL |
| `VITE_RELAY_API_KEY` | _(none)_ | API key for the relay server |

## Building for Production

```bash
# Build all packages
npm run build:server
npm run build:host
npm run build:client
```

Then run the compiled outputs:

```bash
node server/dist/index.js
node llm-host/dist/index.js
```

The client builds to static assets — serve them with any static file server or configure the relay server to serve them.

## Running Tests

```bash
# All tests
npm test

# Individual packages
npm run test:server
npm run test:host
npm run test:client
```

## Architecture

### Server (Relay)

The server is a thin relay between browser clients and AI hosts. It doesn't run models — it:

- Maintains a WebSocket connection to each registered AI host
- Exposes a REST API for clients to list hosts, agents, chats, and workspaces
- Proxies chat and agent requests to the appropriate host via WebSocket
- Streams responses back to clients via Server-Sent Events (SSE)

### AI Host

The host agent runs on the machine with your AI models. It:

- Connects to the relay server on startup via WebSocket
- Registers itself (hostname, model version, available models)
- Sends heartbeats with updated model lists
- Handles incoming requests from the relay (create agent, send message, etc.)
- Runs the full agent loop using `@mariozechner/pi-agent-core`

### Client

A React SPA built with TanStack Router and TanStack Query. It provides:

- Host overview (which AI hosts are connected, what models they have)
- Agent management (create, configure, start, stop)
- Chat interface with streaming responses
- Workspace file explorer

## Project Structure

```
local-ai-free/
├── client/          # React web UI
├── server/          # Express + WebSocket relay
├── llm-host/        # AI host daemon
├── LICENSE          # PolyForm Noncommercial 1.0.0
├── AGENTS.md        # Development guidelines
├── PROGRESS.md      # Development progress log
└── package.json     # Root workspace config
```

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

You may use, modify, and redistribute this software for **noncommercial purposes only**. See the LICENSE file for full terms.