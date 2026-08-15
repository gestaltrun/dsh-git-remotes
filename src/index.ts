/**
 * dsh-git-remotes host half: fenced JSON API for git remote status / fetch /
 * ff-only pull / confirmed push. No model-facing tool — push is a human
 * confirm in the sidebar tab (same idea as Claude Code `/commit-push-pr`:
 * a person starts the push; the agent does not).
 */
import type { Context } from './context-types.ts'
import {
  gitFetchAction,
  gitIsRepo,
  gitPullAction,
  gitPushAction,
  gitRemoteStatus,
  workspaceRoot,
} from './git.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import {
  GitRemotesError,
  optionalBoolean,
  optionalString,
  readJsonBody,
  requireJsonPost,
  writeError,
  writeJson,
  writeOk,
} from './wire.ts'

export { name } from './identity.ts'
export const inject = ['webServer', 'sessions', 'loader']

export const API_PREFIX = '/git-remotes/api'

export {
  classifyFetchFailure,
  classifyPullFailure,
  classifyPushFailure,
} from './classify.ts'
export {
  gitFetchAction,
  gitPullAction,
  gitPushAction,
  gitRemoteList,
  gitRemoteStatus,
  runGit,
  workspaceRoot,
} from './git.ts'
export { parseStatusSb } from './parse-status.ts'
export { isPathInsideRoot, resolvedWorkspaceRoot } from './path-guard.ts'
export { redactRemoteUrl } from './redact.ts'
export { validateRemoteName } from './remote-name.ts'
export { isLoopbackHostname, isTrustedApiRequest } from './trust-fence.ts'

function trustedHostsOf(ctx: Context): string[] {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'connection') {
      const config = entry.options.config
      return config?.trustedHosts ?? []
    }
  }
  return []
}

async function withRepo<T>(
  ctx: Context,
  payload: unknown,
  fn: (root: string) => Promise<T>,
): Promise<T> {
  const sessionId = optionalString(payload, 'session')
  const root = workspaceRoot(ctx, sessionId)
  if (!(await gitIsRepo(root))) {
    throw new GitRemotesError('bad-request', 'not a git repository', 400)
  }
  return fn(root)
}

function writeAction(res: Parameters<typeof writeOk>[0], result: { ok: true } | { ok: false; error: { code: string; message: string } }): void {
  if (result.ok) {
    writeOk(res, { done: true })
    return
  }
  writeJson(res, 200, { ok: false, error: result.error })
}

type ApiMethod = (ctx: Context, payload: unknown) => Promise<unknown> | unknown

function buildApi(): Record<string, ApiMethod> {
  return {
    status: async (ctx, payload) => {
      const sessionId = optionalString(payload, 'session')
      const root = workspaceRoot(ctx, sessionId)
      return gitRemoteStatus(root)
    },
    fetch: async (ctx, payload) => {
      return withRepo(ctx, payload, async (root) => {
        const result = await gitFetchAction(root, {
          remote: optionalString(payload, 'remote'),
          prune: payload !== null && typeof payload === 'object' && 'prune' in payload
            ? optionalBoolean(payload, 'prune')
            : true,
        })
        return result
      })
    },
    pull: async (ctx, payload) => {
      return withRepo(ctx, payload, async (root) => {
        return gitPullAction(root, { remote: optionalString(payload, 'remote') })
      })
    },
    push: async (ctx, payload) => {
      if (optionalBoolean(payload, 'force')) {
        throw new GitRemotesError('force-push-disabled', 'force-push is not offered', 400)
      }
      if (!optionalBoolean(payload, 'confirm')) {
        throw new GitRemotesError('confirm-required', 'push requires confirm: true', 400)
      }
      return withRepo(ctx, payload, async (root) => {
        return gitPushAction(root, {
          remote: optionalString(payload, 'remote'),
          confirm: true,
        })
      })
    },
  }
}

export function apply(ctx: Context): void {
  const api = buildApi()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, trustedHostsOf(ctx))) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      try {
        requireJsonPost(req)
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(`${API_PREFIX}/`.length) : undefined
        if (method === undefined || method.includes('/')) {
          throw new GitRemotesError('not-found', 'unknown git-remotes API method', 404)
        }
        const payload = await readJsonBody(req)
        const handler = api[method]
        if (handler === undefined) {
          throw new GitRemotesError('not-found', `unknown git-remotes API method "${method}"`, 404)
        }
        const value = await handler(ctx, payload)
        if (value !== null && typeof value === 'object' && 'ok' in value) {
          writeAction(res, value as { ok: true } | { ok: false; error: { code: string; message: string } })
          return
        }
        writeOk(res, value)
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-git-remotes: /git-remotes/api routes')
}
