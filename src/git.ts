/**
 * System git spawn: `-C` cwd, argv only (no shell), `LC_ALL=C`, timeout kill.
 * Mirrors dsh-git-status / better-sidebar so locale and injection stay out.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { classifyFetchFailure, classifyPullFailure, classifyPushFailure } from './classify.ts'
import type { Context } from './context-types.ts'
import { parseStatusSb } from './parse-status.ts'
import { resolvedWorkspaceRoot } from './path-guard.ts'
import { redactRemoteUrl } from './redact.ts'
import { validateRemoteName } from './remote-name.ts'

export const GIT_TIMEOUT_MS = 15_000
export const GIT_REMOTE_TIMEOUT_MS = 120_000

export interface GitCommandError extends Error {
  stdout: string
  stderr: string
  exitCode: number | null
}

export type GitActionResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } }

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

function fail(code: string, message: string): GitActionResult {
  return { ok: false, error: { code, message } }
}

export function runGit(root: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['-C', root, '--no-pager', '-c', 'color.ui=false', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', LANG: 'C', GIT_EDITOR: 'true' },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolvePromise(stdout)
        return
      }
      const message = redactRemoteUrl(stderr.trim() || stdout.trim() || `git exited with code ${code}`)
      const error = new Error(message) as GitCommandError
      error.stdout = stdout
      error.stderr = stderr
      error.exitCode = code
      reject(error)
    })
  })
}

export function workspaceRoot(ctx: Context, sessionId: string): string {
  if (sessionId !== '') {
    try {
      const cwd = ctx.sessions?.get?.(sessionId)?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return resolvedWorkspaceRoot(cwd)
    } catch {
      // fall through
    }
  }
  try {
    const list = ctx.workspaceRegistry?.list?.() ?? []
    const first = list[0]
    if (first !== undefined && typeof first.path === 'string' && first.path !== '') {
      return resolvedWorkspaceRoot(first.path)
    }
  } catch {
    // fall through
  }
  return resolve(process.cwd())
}

export async function gitIsRepo(root: string): Promise<boolean> {
  try {
    await runGit(root, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

export async function gitRemoteList(root: string): Promise<string[]> {
  try {
    const out = await runGit(root, ['remote'])
    return out.split(/\r?\n/).filter(line => line !== '')
  } catch {
    return []
  }
}

export async function gitRemoteDetails(root: string): Promise<RemoteEntry[]> {
  try {
    const out = await runGit(root, ['remote', '-v'])
    const byName = new Map<string, RemoteEntry>()
    for (const line of out.split(/\r?\n/)) {
      if (line === '') continue
      const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line)
      if (match === null) continue
      const name = match[1] ?? ''
      const url = redactRemoteUrl(match[2] ?? '')
      const kind = match[3]
      const current = byName.get(name) ?? { name, fetchUrl: '', pushUrl: '' }
      if (kind === 'fetch') current.fetchUrl = url
      else current.pushUrl = url
      byName.set(name, current)
    }
    return [...byName.values()]
  } catch {
    return []
  }
}

async function requireNamedRemote(root: string, remote: string): Promise<GitActionResult | null> {
  if (remote === '') return null
  if (!validateRemoteName(remote)) {
    return fail('invalid-remote-name', 'invalid remote name')
  }
  const remotes = await gitRemoteList(root)
  if (!remotes.includes(remote)) {
    return fail('remote-not-found', `remote "${remote}" does not exist`)
  }
  return null
}

export async function gitRemoteStatus(root: string): Promise<RemoteStatus> {
  if (!(await gitIsRepo(root))) {
    return {
      isRepo: false,
      root,
      branch: null,
      detached: false,
      upstream: null,
      upstreamGone: false,
      ahead: 0,
      behind: 0,
      remotes: [],
    }
  }
  const [statusOut, remotes] = await Promise.all([
    runGit(root, ['status', '-sb']),
    gitRemoteDetails(root),
  ])
  const parsed = parseStatusSb(statusOut)
  return {
    isRepo: true,
    root,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    upstreamGone: parsed.upstreamGone,
    ahead: parsed.ahead,
    behind: parsed.behind,
    remotes,
  }
}

/**
 * Fetch remotes. Empty `remote` → `git fetch --all`.
 * `prune` defaults true here (remotes hygiene; Claude Code `/clean_gone`
 * needs prune so `[gone]` tracking refs disappear).
 */
export async function gitFetchAction(
  root: string,
  { remote = '', prune = true }: { remote?: string; prune?: boolean } = {},
): Promise<GitActionResult> {
  const named = await requireNamedRemote(root, remote)
  if (named !== null) return named
  const args = ['fetch', remote === '' ? '--all' : remote]
  if (prune === true) args.push('--prune')
  try {
    await runGit(root, args, GIT_REMOTE_TIMEOUT_MS)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyFetchFailure(msg) }
  }
}

/**
 * Fast-forward only pull. Diverged histories return `non-ff` — no implicit merge.
 */
export async function gitPullAction(
  root: string,
  { remote = '' }: { remote?: string } = {},
): Promise<GitActionResult> {
  const named = await requireNamedRemote(root, remote)
  if (named !== null) return named
  if (remote === '') {
    try {
      await runGit(root, ['rev-parse', '--abbrev-ref', '@{upstream}'])
    } catch {
      return fail('no-upstream', 'current branch has no upstream; choose a remote')
    }
  }
  const args = remote === '' ? ['pull', '--ff-only'] : ['pull', '--ff-only', remote]
  try {
    await runGit(root, args, GIT_REMOTE_TIMEOUT_MS)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyPullFailure(msg) }
  }
}

/**
 * Push the current branch. Requires `confirm: true` at the route layer.
 * Never `--force`. If `remote` is set, `git push -u <remote> HEAD`.
 */
export async function gitPushAction(
  root: string,
  { remote = '', confirm = false }: { remote?: string; confirm?: boolean } = {},
): Promise<GitActionResult> {
  if (confirm !== true) {
    return fail('confirm-required', 'push requires confirm: true')
  }
  const named = await requireNamedRemote(root, remote)
  if (named !== null) return named
  if (remote === '') {
    try {
      await runGit(root, ['rev-parse', '--abbrev-ref', '@{upstream}'])
    } catch {
      return fail('no-upstream', 'current branch has no upstream; choose a remote')
    }
  }
  const args = remote === '' ? ['push'] : ['push', '-u', remote, 'HEAD']
  try {
    await runGit(root, args, GIT_REMOTE_TIMEOUT_MS)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyPushFailure(msg) }
  }
}
