# Progress Log

## Store & Display Thinking Content

### Problem

The thinking content streamed during a model response is displayed live in the `StreamingMessageBubble`, but is never persisted to the database. Once the stream completes, the thinking text is lost — completed messages have no reasoning to show.

The `messages` table only stores `reasoning_tokens` (a count), not the actual thinking text. The client `Message` type has no `thinking` field. `MessageBubble` relies on `parseReasoning(msg.content)` which looks for `<think>` tags that are never present in agent messages.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **TH1** | ✅ DONE | **DB schema: add `thinking_content` column** — Add `thinking_content TEXT` to `messages` `CREATE TABLE`. Update `MessageRow`, `InsertMessageInput`, `RawMessage`, `toMessage`, `insertMsgStmt`, and `insertMessage` in `chat-db.ts`. Tests: insert/read roundtrip with and without thinking content. |
| **TH2** | ✅ DONE | **Capture thinking text in agent-runner and persist it** — In `agent-runner.ts`, concatenate `thinkingBlocks` text and include `thinkingContent: string` in the return value. In `send-message.ts`, pass it to `chatDb.insertMessage`. Tests: stub LLM response with thinking blocks, verify DB row has thinking text. |
| **TH3** | ✅ DONE | **Expose thinking text through the API** — `thinkingContent` already flows through `llm-host` `get-chat` response and the server relay. Add `thinking?: string \| null` to client `Message` type; map `thinkingContent` in `useChatDetail`. Tests: llm-host `get-chat` includes `thinkingContent`; server passes it through; `useChatDetail` maps it to `thinking`. |
| **TH4** | ✅ DONE | **Display thinking in completed `MessageBubble`** — Update `MessageBubble` to use `msg.thinking` directly in `ReasoningBlock` instead of `parseReasoning(msg.content)`. Tests: `MessageBubble` renders `ReasoningBlock` when `msg.thinking` is set; no regression when absent. |
