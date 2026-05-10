interface RequestEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface StreamEntry {
  resultEntry: RequestEntry;
  /** Push queue for stream events. `null` signals end-of-stream. */
  eventQueue: (Record<string, unknown> | null)[];
  /** Resolves when a new item is pushed to eventQueue. */
  eventNotify: () => void;
  /** Set up the next notify resolver. */
  setEventNotify: (fn: () => void) => void;
  /** The per-request listener added to the socket for stream messages. */
  streamListener: ((raw: unknown) => void) | null;
}

export interface StreamResult {
  events: AsyncIterable<Record<string, unknown>>;
  result: Promise<unknown>;
  /** The internal request ID — can be used with `abortStream()` to cancel. */
  requestId: string;
}

export interface Socket {
  send(data: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

export interface AgentRouter {
  registerHost(hostId: string, socket: Socket): void;
  unregisterHost(hostId: string): void;
  request(hostId: string, req: { action: string; payload: unknown }, options?: { timeoutMs?: number }): Promise<unknown>;
  streamRequest(hostId: string, req: { action: string; payload: unknown }, options?: { timeoutMs?: number }): Promise<StreamResult>;
  /** Abort an in-flight stream request. Sends an abort message to the host and cleans up. No-op if the request is already completed or unknown. */
  abortStream(requestId: string): void;
  destroy(): void;
}

/** Tracks requestId → hostId so we can batch-reject on disconnect. */
function createAgentRouter(): AgentRouter {
  const sockets = new Map<string, Socket>();
  const listeners = new Map<string, (raw: unknown) => void>();
  const pending = new Map<string, RequestEntry>();
  /** Maps requestId → hostId for disconnect handling. */
  const requestHosts = new Map<string, string>();
  let idCounter = 0;

  const streamEntries = new Map<string, StreamEntry>();

  function handleIncoming(hostId: string, raw: unknown) {
    const rawStr = typeof raw === "string" ? raw : (raw as Buffer).toString();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawStr);
    } catch {
      return;
    }

    if (typeof msg.id !== "string") return;

    if (msg.type !== "response") return;

    // Check if this is a stream request's final response
    const streamEntry = streamEntries.get(msg.id);
    if (streamEntry) {
      streamEntries.delete(msg.id);
      requestHosts.delete(msg.id);
      clearTimeout(streamEntry.resultEntry.timer);

      // Remove the per-request stream listener
      if (streamEntry.streamListener) {
        const sock = sockets.get(hostId);
        if (sock) sock.off("message", streamEntry.streamListener);
      }

      // Signal end of events
      streamEntry.eventQueue.push(null);
      streamEntry.eventNotify();

      if (typeof msg.error === "string") {
        streamEntry.resultEntry.reject(new Error(msg.error));
      } else {
        streamEntry.resultEntry.resolve(msg.data);
      }
      return;
    }

    // Regular (non-stream) request
    const entry = pending.get(msg.id);
    if (!entry) return; // unknown request ID, ignore

    pending.delete(msg.id);
    requestHosts.delete(msg.id);
    clearTimeout(entry.timer);

    if (typeof msg.error === "string") {
      entry.reject(new Error(msg.error));
    } else {
      entry.resolve(msg.data);
    }
  }

  function rejectForHost(hostId: string, reason: string) {
    const toReject: RequestEntry[] = [];
    const toDelete: string[] = [];
    const streamToDelete: string[] = [];
    for (const [reqId, ownerHost] of requestHosts) {
      if (ownerHost === hostId) {
        const entry = pending.get(reqId);
        if (entry) {
          toReject.push(entry);
          toDelete.push(reqId);
        }
        const streamEntry = streamEntries.get(reqId);
        if (streamEntry) {
          toReject.push(streamEntry.resultEntry);
          streamToDelete.push(reqId);
          // Signal end of events
          streamEntry.eventQueue.push(null);
          streamEntry.eventNotify();
          // Remove per-request stream listener
          if (streamEntry.streamListener) {
            const sock = sockets.get(hostId);
            if (sock) sock.off("message", streamEntry.streamListener);
          }
        }
      }
    }
    for (const entry of toReject) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    for (const reqId of toDelete) {
      pending.delete(reqId);
      requestHosts.delete(reqId);
    }
    for (const reqId of streamToDelete) {
      streamEntries.delete(reqId);
      // already removed from requestHosts above
    }
  }

  function rejectAll(reason: string) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    for (const [reqId, streamEntry] of streamEntries) {
      clearTimeout(streamEntry.resultEntry.timer);
      streamEntry.resultEntry.reject(new Error(reason));
      streamEntry.eventQueue.push(null);
      streamEntry.eventNotify();
      if (streamEntry.streamListener) {
        const hostId = requestHosts.get(reqId);
        if (hostId) {
          const sock = sockets.get(hostId);
          if (sock) sock.off("message", streamEntry.streamListener);
        }
      }
    }
    pending.clear();
    streamEntries.clear();
    requestHosts.clear();
  }

  function nextId(): string {
    return String(++idCounter);
  }

  return {
    registerHost(hostId, socket) {
      sockets.set(hostId, socket);

      const listener = (raw: unknown) => handleIncoming(hostId, raw);
      socket.on("message", listener);
      listeners.set(hostId, listener);
    },

    unregisterHost(hostId) {
      const socket = sockets.get(hostId);
      const listener = listeners.get(hostId);
      if (socket && listener) {
        socket.off("message", listener);
      }
      sockets.delete(hostId);
      listeners.delete(hostId);

      rejectForHost(hostId, "host disconnected");
    },

    request(hostId, req, options = {}) {
      const socket = sockets.get(hostId);
      if (!socket) {
        return Promise.reject(new Error(`host ${hostId} not found`));
      }

      const id = nextId();
      const timeoutMs = options.timeoutMs ?? 10_000;

      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          requestHosts.delete(id);
          reject(new Error(`host ${hostId} request timed out`));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });
        requestHosts.set(id, hostId);

        socket.send(JSON.stringify({
          type: "request",
          id,
          action: req.action,
          payload: req.payload,
        }));
      });
    },

    async streamRequest(hostId, req, options = {}) {
      const socket = sockets.get(hostId);
      if (!socket) {
        return Promise.reject(new Error(`host ${hostId} not found`));
      }

      const id = nextId();
      const timeoutMs = options.timeoutMs ?? 120_000;

      // Create the async iterable for stream events
      const eventQueue: (Record<string, unknown> | null)[] = [];
      let eventNotifyFn: (() => void) | null = null;
      const eventNotifyPromise = () => new Promise<void>((resolve) => { eventNotifyFn = resolve; });
      // Kick off the first wait so the iterator can await it
      let notifyWait = eventNotifyPromise();

      function pushEvent(item: Record<string, unknown> | null) {
        eventQueue.push(item);
        if (eventNotifyFn) {
          eventNotifyFn();
          eventNotifyFn = null;
        }
      }

      const events: AsyncIterable<Record<string, unknown>> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              // Drain any already-queued items
              if (eventQueue.length > 0) {
                const item = eventQueue.shift()!;
                if (item === null) return { value: undefined, done: true } as IteratorResult<Record<string, unknown>>;
                return { value: item, done: false };
              }
              // Wait for new items
              await notifyWait;
              // Set up a fresh promise for the next wait BEFORE consuming
              notifyWait = eventNotifyPromise();
              const item = eventQueue.shift()!;
              if (item === null) return { value: undefined, done: true } as IteratorResult<Record<string, unknown>>;
              return { value: item, done: false };
            },
          };
        },
      };

      // Result promise — resolved when the final "response" message arrives
      const resultPromise = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          streamEntries.delete(id);
          requestHosts.delete(id);
          pushEvent(null); // end the events iterable
          reject(new Error(`host ${hostId} request timed out`));
        }, timeoutMs);

        const resultEntry: RequestEntry = { resolve, reject, timer };

        const streamListener = (raw: unknown) => {
          const rawStr = typeof raw === "string" ? raw : (raw as Buffer).toString();
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(rawStr);
          } catch {
            return;
          }
          if (msg.id !== id) return;
          if (msg.type === "stream") {
            pushEvent(msg as Record<string, unknown>);
          }
        };

        const streamEntry: StreamEntry = {
          resultEntry,
          eventQueue,
          eventNotify() {
            if (eventNotifyFn) {
              eventNotifyFn();
              eventNotifyFn = null;
            }
            // Set up next wait
            notifyWait = eventNotifyPromise();
          },
          setEventNotify(fn) {
            eventNotifyFn = fn;
          },
          streamListener: null, // set below
        };

        // We use a dedicated per-request listener for stream messages
        // The main handleIncoming still handles the final "response" message
        socket.on("message", streamListener);
        streamEntry.streamListener = streamListener;

        streamEntries.set(id, streamEntry);
        requestHosts.set(id, hostId);

        socket.send(JSON.stringify({
          type: "request",
          id,
          action: req.action,
          payload: req.payload,
        }));
      });

      return { events, result: resultPromise, requestId: id };
    },

    abortStream(requestId: string) {
      const streamEntry = streamEntries.get(requestId);
      if (!streamEntry) return; // already completed or unknown — no-op

      const hostId = requestHosts.get(requestId);

      // Clean up maps
      streamEntries.delete(requestId);
      requestHosts.delete(requestId);
      clearTimeout(streamEntry.resultEntry.timer);

      // Remove the per-request stream listener
      if (streamEntry.streamListener && hostId) {
        const sock = sockets.get(hostId);
        if (sock) sock.off("message", streamEntry.streamListener);
      }

      // Send abort message to the host so it can stop generation
      if (hostId) {
        const sock = sockets.get(hostId);
        if (sock) {
          sock.send(JSON.stringify({ type: "abort", id: requestId }));
        }
      }

      // Signal end of events iterable
      streamEntry.eventQueue.push(null);
      streamEntry.eventNotify();

      // Reject the result promise
      streamEntry.resultEntry.reject(new Error("aborted"));
    },

    destroy() {
      for (const [hostId] of sockets) {
        const socket = sockets.get(hostId);
        const listener = listeners.get(hostId);
        if (socket && listener) {
          socket.off("message", listener);
        }
      }
      sockets.clear();
      listeners.clear();
      rejectAll("router destroyed");
    },
  };
}

export { createAgentRouter };
