export interface ReconnectorOptions {
  delayMs: number;
  onReconnect: () => void;
}

export interface Reconnector {
  onConnectionLost: () => void;
  stop: () => void;
}

export function createReconnector(options: ReconnectorOptions): Reconnector {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onConnectionLost = () => {
    // Don't schedule multiple concurrent reconnects.
    if (timer !== null) return;

    timer = setTimeout(() => {
      timer = null;
      options.onReconnect();
    }, options.delayMs);
  };

  const stop = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { onConnectionLost, stop };
}
