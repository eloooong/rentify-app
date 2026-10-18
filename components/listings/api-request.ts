/**
 * Same-origin call to Person B's /api/catalog routes from the browser. The
 * browser sends the session cookies and the Origin header that the API
 * requires for writes. JSON bodies are encoded; FormData is sent as-is so
 * the browser sets the multipart boundary.
 */
export async function apiRequest(method: string, url: string, body?: unknown) {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const response = await fetch(url, init);
  const json = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, json };
}
