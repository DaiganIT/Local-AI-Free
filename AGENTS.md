# Project Guidelines

This document contains rules and principles that must be followed when working on this project. They apply at all times.

## Project Overview

**Local LLM Tinkerer** — a relay-based system that lets a browser client chat with local LLM hosts over the internet.

- **`client/`** — React web app (TanStack Router, Vite). Users browse available LLM hosts and send messages.
- **`server/`** — Node.js relay (Express + WebSocket, `ws`). Always-connected bridge between client and llm-hosts.
- **`llm-host/`** — Node.js agent that connects to server at startup, registers itself (hostname, Ollama version, models), and sends heartbeats. Queries local Ollama API for model info.

## Core Principles

### 1. KISS — Keep It Simple

- Prefer the simplest solution that works. No premature abstraction.
- Don't add a library if a few lines of code suffice.
- Don't over-engineer for hypothetical scale — solve the current problem.
- If it's hard to explain in one sentence, it's probably too complex.

### 2. TDD — Test-Driven Development, Always

- Every feature starts with a failing test. Red → Green → Refactor.
- Write testable code: pure functions, dependency injection, clear boundaries.
- No feature is "done" until it has passing tests.
- If something is hard to test, that's a design smell — refactor it.

### 3. Vertical Slices — Deliver Feature by Feature

- Build features in thin verical slices, but **one small piece at a time**.
- Example: "send a message" starts with just the data flowing through; no UI polish, no error handling, no streaming — just the pipeline working.
- Test each slice independently before moving to the next.
- Never build the backend, then the frontend, then wire them up — deliver end-to-end, but one slice at a time.

### 4. Ask Before Assuming — Stop and Discuss Ambiguities

- When building, if you encounter a problem or ambiguity with the proposed approach, **stop and ask the user**.
- Don't just pick a solution and assume it's correct.
- Tell the user: "Hey, I found this problem: <...>. How should we solve it?" and present 2–3 proposed solutions.
- Wait for the user's decision before proceeding.

### 5. Slice first - Implement later

- When discussing a new feature, come up with the slices first
- Don't implement anything until we have the slices ready
- Slices need to be approved by the user before implementing
- Slices have to be written - as todo in the progress.md file before starting 

## Committing

This is a monorepo with npm workspaces. All three packages (`client/`, `server/`, `llm-host/`) share a single git history. Commit from the repository root.

## Workflow

1. Understand the slice you're building (keep it small).
2. Write a failing test.
3. Implement the minimum code to pass the test.
4. Refactor if needed while keeping tests green.
5. Repeat for the next slice.

## Progress

After completing each task, update `PROGRESS.md` with what was done and what's next.
