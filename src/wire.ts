/**
 * JSON API wire helpers. Mutations require POST + application/json
 * (CSRF: a cross-site form cannot set that content-type).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export type GitRemotesErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'forbidden'
  | 'method-error'
  | 'confirm-required'
  | 'force-push-disabled'
  | 'invalid-remote-name'
  | 'internal'

export class GitRemotesError extends Error {
  constructor(
    readonly code: GitRemotesErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const MAX_BODY_BYTES = 1 << 20

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new GitRemotesError('bad-request', 'request body too large')
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new GitRemotesError('bad-request', 'request body is not valid JSON')
  }
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

export function writeOk(res: ServerResponse, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof GitRemotesError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}

export function requireJsonPost(req: IncomingMessage): void {
  if (req.method !== 'POST') {
    throw new GitRemotesError('method-error', 'method not allowed', 405)
  }
  const contentType = req.headers['content-type'] ?? ''
  if (!String(contentType).toLowerCase().startsWith('application/json')) {
    throw new GitRemotesError('method-error', 'unsupported media type', 415)
  }
}

export function optionalString(payload: unknown, key: string): string {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new GitRemotesError('bad-request', `invalid "${key}"`)
  }
  return value
}

export function optionalBoolean(payload: unknown, key: string): boolean {
  const record = payload as Record<string, unknown> | null
  return record?.[key] === true
}
