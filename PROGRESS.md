# Progress Log


## File @-mention in Chat

### Problem

Users can attach files via the paperclip button, but there's no quick way to reference an already-uploaded file. Typing `@` in the chat input should open a popover listing the last 5 files from the agent's workspace, filterable by typing, selectable with Enter — attaching the file without re-uploading it.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **FM1** | ✅ DONE | **`useRecentUploads` hook** — Calls `useAgentFolderTree(agentId)` internally. Flattens all `kind: 'file'` leaf nodes and returns the last 5. No new fetch — shares the existing query cache. Tests: tree with 8 files → 5 returned; only dirs → []; 2 files → 2 returned. |
| **FM2** | ✅ DONE | **`parseMention` pure function** — `parseMention(value, cursorPos)` returns `{ active, query, triggerStart }`. Scans backward from cursor to find `@` with no whitespace in between. Tests: mid-word query, empty query, space-terminated, no `@`. |
| **FM3** | ✅ DONE | **`FileMentionPopover` component** — Stateless. Props: `files`, `query`, `selectedIndex`, `onSelect`, `onClose`. Filters by substring match on `name`. Floats above the input. Shows "No recent files" when filter yields nothing. Tests: renders filtered list, highlights selectedIndex, calls onSelect on click. |
| **FM4** | ✅ DONE | **Wire mention into `ChatView`** — Add `mentionedAttachments` state (separate from `pendingAttachments`, not shown as chips). Track `mentionState` via `parseMention` on every `onChange`. Show popover when active. `↑`/`↓` navigate, `Enter`/click select, `Escape` closes. On select: replace `@query` in input with `@filename` text, push file into `mentionedAttachments`. Merge both lists at send time. Mention chips are not shown — the `@filename` text in the input is the visual indicator. |
