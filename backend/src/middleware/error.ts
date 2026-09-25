import type { ErrorRequestHandler, Request } from 'express';
import { fail } from '../utils/response';
import { logError } from '../utils/logger';

/**
 * Final Express error handler.
 *
 * Without this, Express answers with its own HTML error page. That breaks the
 * documented API contract (docs/API.md §18 — every response is the
 * `success`/`error` envelope) and leaves the Angular client unable to read an
 * error code, so it falls back to a generic message.
 *
 * Responsibilities:
 *  - Always answer with the standard envelope.
 *  - Log unexpected errors server-side (name + allow-listed fields only).
 *  - Never leak stack traces, SQL text or request bodies to the client
 *    (AGENTS.md §34).
 */

interface HttpishError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

/** Client-safe messages for errors raised by body/middleware parsing. */
function clientMessageFor(err: HttpishError): { status: number; message: string } {
  const status = err.status ?? err.statusCode ?? 500;
  // express.json() rejects unparseable or oversized bodies before any
  // controller runs. Name the problem without echoing the payload back.
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'Request body must be valid JSON.' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large.' };
  }
  if (status === 413) {
    return { status: 413, message: 'Request body is too large.' };
  }
  if (status >= 400 && status < 500) {
    return { status, message: 'Invalid request.' };
  }
  return { status: 500, message: 'An unexpected error occurred.' };
}

export function errorHandler(): ErrorRequestHandler {
  return (err: unknown, req: Request, res, next) => {
    if (res.headersSent) {
      // The response is already streaming; let Express tear the socket down.
      next(err);
      return;
    }

    const httpish = err as HttpishError;
    const { status, message } = clientMessageFor(httpish ?? {});

    if (status >= 500) {
      logError('request.unhandled_error', err, { method: req.method, path: req.path });
    }

    if (status === 500) {
      fail(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
      return;
    }
    // 4xx raised before a controller runs is a malformed request; VALIDATION_ERROR
    // is the closest existing code and keeps the client on its known-code path.
    fail(res, 'VALIDATION_ERROR', message, status);
  };
}
