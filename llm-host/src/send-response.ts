export function sendResponse(
  send: (data: unknown) => void,
  id: string,
  data?: unknown,
  error?: string,
): void {
  if (error !== undefined) {
    send({ type: "response", id, error });
  } else {
    send({ type: "response", id, data });
  }
}
