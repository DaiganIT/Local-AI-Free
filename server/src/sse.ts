import type { Response } from "express";
import type { AgentRouter, StreamResult } from "./agent-router.js";
import type { HostInfo } from "./types.js";
import { FanOutError, NoHostsError } from "./fanout.js";

// ── SSE helper ───────────────────────────────────────────────────────────────
// Sets SSE headers on the response, acquires a stream by fanning out
// to hosts, forwards events, and handles cleanup (abort on disconnect,
// error events, done event).

export interface SseStreamOptions {
  /** The action to send to the llm-host (e.g. "send-message"). */
  action: string;
  /** The payload for the action. */
  payload: Record<string, unknown>;
  /** Timeout in ms for acquiring the stream. Defaults to 120_000. */
  timeoutMs?: number;
  /** If true, preserve `agentId` from the outer event when flattening message_update. */
  preserveAgentId?: boolean;
}

/**
 * Sets up an SSE connection on `res`, fans out to hosts to acquire a stream,
 * forwards events, and handles cleanup. Writes error/done SSE events as needed.
 *
 * The caller is responsible for parameter validation before calling this.
 * If no hosts are connected, writes an error event and ends the response.
 */
export async function streamToSse(
  res: Response,
  hosts: HostInfo[],
  agentRouter: AgentRouter,
  options: SseStreamOptions,
): Promise<void> {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Disable Nagle's algorithm so small SSE writes go out immediately
  // without waiting for TCP coalescing. Also try the flush method
  // if available (Node >= 16, some middlewares).
  res.socket?.setNoDelay(true);

  // Acquire stream — try each host until one accepts
  let streamResult: StreamResult | null = null;
  const errors: Error[] = [];

  for (const h of hosts) {
    try {
      streamResult = await agentRouter.streamRequest(
        h.id,
        { action: options.action, payload: options.payload },
        { timeoutMs: options.timeoutMs ?? 120_000 },
      );
      break; // first host that accepts wins
    } catch (err) {
      errors.push(err as Error);
    }
  }

  if (!streamResult) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: errors.map((e) => e.message).join(", ") })}\n\n`);
    res.end();
    return;
  }

  // Forward stream events as SSE
  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
    if (streamResult) {
      agentRouter.abortStream(streamResult.requestId);
    }
  });

  try {
    for await (const msg of streamResult.events) {
      if (clientDisconnected) break;
      if (!msg || !msg.event) continue;
      const event = msg.event as Record<string, unknown>;
      if (!event || !event.type) continue;

      // Extract the SSE event type and data
      let sseEventType = String(event.type);
      let sseData: Record<string, unknown> = { ...event };

      // Flatten message_update to use the inner event type
      if (event.type === "message_update" && event.assistantMessageEvent) {
        const inner = event.assistantMessageEvent as Record<string, unknown>;
        sseEventType = String(inner.type);
        sseData = { ...inner };

        // Preserve agentId from the outer event if needed
        if (options.preserveAgentId && event.agentId && !sseData.agentId) {
          sseData.agentId = event.agentId;
        }
      }

      res.write(`event: ${sseEventType}\ndata: ${JSON.stringify(sseData)}\n\n`);
    }

    // Wait for the final result and emit a done event
    const finalResult = await streamResult.result;
    res.write(`event: done\ndata: ${JSON.stringify(finalResult)}\n\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "stream error";
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  }

  res.end();
}