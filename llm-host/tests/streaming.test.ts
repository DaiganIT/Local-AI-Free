import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildStreamMessage } from "../src/protocol.js";
import type { StreamEvent } from "../src/protocol.js";

// ── Protocol tests ──────────────────────────────────────────────────────

describe("Stream protocol", () => {
  describe("buildStreamMessage", () => {
    it("serializes a stream message with id and event", () => {
      const event: StreamEvent = {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
      };
      const json = buildStreamMessage("req-123", event);

      const msg = JSON.parse(json);
      expect(msg).toEqual({
        type: "stream",
        id: "req-123",
        event: {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
        },
      });
    });

    it("serializes a stream message with a thinking_delta event", () => {
      const event: StreamEvent = {
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "Let me think...", contentIndex: 0 },
      };
      const json = buildStreamMessage("req-456", event);

      const msg = JSON.parse(json);
      expect(msg).toEqual({
        type: "stream",
        id: "req-456",
        event: {
          type: "message_update",
          assistantMessageEvent: { type: "thinking_delta", delta: "Let me think...", contentIndex: 0 },
        },
      });
    });

    it("serializes a stream message with a tool_execution_start event", () => {
      const event: StreamEvent = {
        type: "tool_execution_start",
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "/tmp/test.txt" },
      };
      const json = buildStreamMessage("req-789", event);

      const msg = JSON.parse(json);
      expect(msg).toEqual({
        type: "stream",
        id: "req-789",
        event: {
          type: "tool_execution_start",
          toolCallId: "tc-1",
          toolName: "read",
          args: { path: "/tmp/test.txt" },
        },
      });
    });

    it("serializes a stream message with an agent_start event", () => {
      const event: StreamEvent = { type: "agent_start" };
      const json = buildStreamMessage("req-100", event);

      const msg = JSON.parse(json);
      expect(msg).toEqual({
        type: "stream",
        id: "req-100",
        event: { type: "agent_start" },
      });
    });

    it("serializes a stream message with an agent_end event", () => {
      const event: StreamEvent = { type: "agent_end", messages: [] };
      const json = buildStreamMessage("req-101", event);

      const msg = JSON.parse(json);
      expect(msg).toEqual({
        type: "stream",
        id: "req-101",
        event: { type: "agent_end", messages: [] },
      });
    });
  });
});
