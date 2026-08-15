/**
 * Typed fetch wrapper over `/git-remotes/api`. Mutations always POST JSON
 * (CSRF content-type). Push must send `confirm: true`.
 */
export class GitRemotesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface RemoteEntry {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface RemoteStatus {
  isRepo: boolean
  root: string
  branch: string | null
  detached: boolean
  upstream: string | null
  upstreamGone: boolean
  ahead: number
  behind: number
  remotes: RemoteEntry[]
}

async function call<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/git-remotes/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    throw new GitRemotesApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new GitRemotesApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value as T
}

export const gitRemotesApi = {
  status: (session: string, signal?: AbortSignal) =>
    call<RemoteStatus>('status', { session }, signal),
  fetch: (session: string, remote: string, prune: boolean, signal?: AbortSignal) =>
    call<{ done: true }>('fetch', { session, remote, prune }, signal),
  pull: (session: string, remote: string, signal?: AbortSignal) =>
    call<{ done: true }>('pull', { session, remote }, signal),
  push: (session: string, remote: string, signal?: AbortSignal) =>
    call<{ done: true }>('push', { session, remote, confirm: true }, signal),
}

/** User-facing copy for classified error codes. */
export const ERROR_COPY: Record<string, string> = {
  'network-error': '网络失败：无法连接远程。',
  'authentication-error': '认证失败：检查凭据或 SSH 密钥。不要把 token 贴进对话。',
  'remote-unreachable': '远程名存在，但仓库不可达。',
  'remote-not-found': '没有这个远程名。',
  'invalid-remote-name': '远程名不合法。',
  'non-ff': '无法快进：本地与远程已分叉。请先人工处理，插件不会隐式 merge。',
  'no-upstream': '当前分支没有上游。请选择一个远程再试。',
  'rejected-non-ff': '推送被拒绝（非快进）。请先 fetch / ff-only pull。',
  'confirm-required': '推送需要你在面板里确认。',
  'force-push-disabled': '本插件不提供 force-push。',
  forbidden: '请求被拒绝（跨站或 Host 不受信任）。',
  network: '无法联系本机 dsh。',
}

export function messageForError(error: GitRemotesApiError): string {
  return ERROR_COPY[error.code] ?? error.message
}
