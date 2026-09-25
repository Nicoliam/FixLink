/**
 * Minimal structured logger (AGENTS.md §35).
 *
 * Logs are written to stdout/stderr so they are captured by the process
 * supervisor. Nothing sensitive is ever written: callers pass an explicit
 * context object, and any value is redacted unless its key is on the
 * allow-list. Error messages are reduced to the error NAME plus the
 * explicitly supplied safe fields — never a stack trace, SQL text, or
 * request body.
 */

/** Context keys that are safe to emit verbatim. */
const SAFE_KEYS = new Set([
  'code',
  'name',
  'status',
  'errno',
  'sqlState',
  'userId',
  'role',
  'method',
  'path',
  'errorCode',
  'errorName',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SAFE_KEYS.has(key) ? redact(val, depth + 1) : '[redacted]';
    }
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return '[unloggable]';
}

/** Emit an informational line. */
export function logInfo(event: string, context: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console -- single, deliberate log sink.
  console.log(JSON.stringify({ level: 'info', event, ...(redact(context) as object) }));
}

/**
 * Emit an unexpected-error line.
 *
 * Only the error name and allow-listed fields are recorded. Stack traces,
 * SQL statements and request/response bodies are deliberately excluded so
 * logs stay safe to ship to a log aggregator.
 */
export function logError(event: string, error: unknown, context: Record<string, unknown> = {}): void {
  const err = error as { name?: string; code?: string; errno?: number; sqlState?: string } | null;
  const safe: Record<string, unknown> = {
    ...context,
    errorName: err?.name ?? 'Error',
  };
  if (err?.code !== undefined) safe['errorCode'] = err.code;
  if (err?.errno !== undefined) safe['errno'] = err.errno;
  if (err?.sqlState !== undefined) safe['sqlState'] = err.sqlState;
  // eslint-disable-next-line no-console -- single, deliberate log sink.
  console.error(JSON.stringify({ level: 'error', event, ...(redact(safe) as object) }));
}
