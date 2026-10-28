export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Builds the final response. 204/304 never carry a body. */
export function buildResponse(status: number, body?: unknown, headers: Record<string, string> = {}): MockResponse {
  if (status === 204 || status === 304) return { status, headers };
  return { status, body, headers };
}
