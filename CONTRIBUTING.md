# Contributing to Local AI Free

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone <repo-url>
cd local-ai-free

# Install dependencies for all packages
npm install
```

### Prerequisites

- Node.js 20+
- npm
- [Ollama](https://ollama.com/download) (for running LLMs locally)

### Environment Variables

Each component has its own `.env` file. Copy the examples to get started:

```bash
cp server/.env.example server/.env
cp llm-host/.env.example llm-host/.env
cp client/.env.example client/.env
```

## Running in Development

Each component runs in its own terminal:

```bash
# Terminal 1: Relay server (port 3000)
npm run dev:server

# Terminal 2: LLM host (connects to server via WebSocket)
npm run dev:host

# Terminal 3: Web client (port 4000)
npm run dev:client
```

Open http://localhost:4000 in your browser.

## Running Tests

```bash
# All tests
npm test

# Individual packages
npm run test:server
npm run test:host
npm run test:client
```

Tests use [Vitest](https://vitest.dev/). Please write tests for any new features.

## Project Structure

```
local-ai-free/
├── client/          # React web UI (TanStack Router + Query)
├── server/          # Express + WebSocket relay
├── llm-host/        # Ollama agent daemon
└── package.json     # Root workspace config
```

## Development Guidelines

- **Keep It Simple** — Prefer the simplest solution that works. No premature abstraction.
- **Test-Driven Development** — Every feature starts with a failing test. Red → Green → Refactor.
- **Vertical Slices** — Build features end-to-end, one thin slice at a time.
- **Ask Before Assuming** — If something is ambiguous, stop and ask rather than guessing.

See [AGENTS.md](./AGENTS.md) for the full guidelines.

## Pull Requests

1. Create a branch from `main`
2. Make your changes with tests
3. Ensure all tests pass: `npm test`
4. Open a pull request with a clear description

## Reporting Issues

Open a GitHub issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Relevant logs or screenshots