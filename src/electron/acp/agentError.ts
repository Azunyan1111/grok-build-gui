/**
 * JSON-RPC failures from the agent arrive as `RequestError`, whose `message` is
 * only the generic code text ("Internal error"). The real cause — an exhausted
 * plan quota, an upstream HTTP status, a context overflow — travels in `data`.
 * Fold that detail into the message so the UI never has to guess which one it
 * was.
 */

const DETAIL_KEYS = ["message", "error", "detail", "details", "reason"] as const;

function pickDetail(data: unknown, depth = 0): string {
  if (data == null || depth > 3) return "";
  if (typeof data === "string") return data.trim();
  if (typeof data === "number" || typeof data === "boolean") return String(data);
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = pickDetail(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof data !== "object") return "";

  const record = data as Record<string, unknown>;
  for (const key of DETAIL_KEYS) {
    const found = pickDetail(record[key], depth + 1);
    if (found) return found;
  }
  try {
    const json = JSON.stringify(data);
    return json && json !== "{}" ? json : "";
  } catch {
    return "";
  }
}

/** Message for `e`, enriched with any JSON-RPC `data` payload it carries. */
export function describeAgentError(e: unknown): string {
  const base = (e instanceof Error ? e.message : String(e)).trim();
  const detail = pickDetail(
    (e as { data?: unknown } | null | undefined)?.data,
  ).slice(0, 600);
  if (!detail) return base;
  if (!base) return detail;
  if (base.toLowerCase().includes(detail.toLowerCase())) return base;
  return `${base}: ${detail}`;
}
