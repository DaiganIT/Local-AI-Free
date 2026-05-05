/**
 * Request tracker — keeps track of in-flight streaming requests
 * so they can be aborted when the client disconnects.
 *
 * Each entry stores an `abort` callback that, when called,
 * stops the running agent and resolves the pending promise
 * with a partial result.
 */

export interface TrackedRequest {
  /** Abort the in-flight request. */
  abort: () => void;
}

export interface RequestTracker {
  /** Register an in-flight request. */
  register(requestId: string, entry: TrackedRequest): void;

  /** Unregister a completed/errored request. */
  unregister(requestId: string): void;

  /** Get a tracked request by ID. Returns undefined if not found. */
  get(requestId: string): TrackedRequest | undefined;

  /** Abort a tracked request. Calls the abort callback and unregisters. No-op if not found. */
  abort(requestId: string): void;
}

export function createRequestTracker(): RequestTracker {
  const active = new Map<string, TrackedRequest>();

  return {
    register(requestId: string, entry: TrackedRequest): void {
      active.set(requestId, entry);
    },

    unregister(requestId: string): void {
      active.delete(requestId);
    },

    get(requestId: string): TrackedRequest | undefined {
      return active.get(requestId);
    },

    abort(requestId: string): void {
      const entry = active.get(requestId);
      if (!entry) return;

      entry.abort();
      active.delete(requestId);
    },
  };
}
