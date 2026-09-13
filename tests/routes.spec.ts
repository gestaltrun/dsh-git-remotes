import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { onTestFinished } from 'vitest'
import { apply, API_PREFIX } from '../src/index.ts'
import type { Context } from '../src/context-types.ts'
import { makeRemote, makeRepo, runGit } from './fixtures/repo.ts'

function fakeCtx(root: string, rejection?: 401 | 403, privateRequest?: unknown) {
  const routes: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = []
  const ctx = {
    sessions: { get: (id: string) => id === 'test-session' ? { header: { cwd: root } } : undefined },
    sessionPersistence: { stat: async () => undefined },
    webRuntime: { trustedHosts: [] },
    connection: { requestRejection: () => rejection },
    get: (name: string) => name === 'desktopPrivateHttp' ? { isTrusted: (request: unknown) => request === privateRequest } : undefined,
    webServer: {
      register: (route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        routes.push(route)
        return () => {}
      },
    },
    effect: (fn: () => unknown) => fn(),
  }
  apply(ctx as unknown as Context)
  return {
    routes,
    handler: routes[0]?.handler,
  }
}

function fakeReq({
  method = 'POST',
  contentType = 'application/json',
  body = '{}',
  url = `${API_PREFIX}/fetch`,
  host = '127.0.0.1:8080',
}: {
  method?: string
  contentType?: string | undefined
  body?: string
  url?: string
  host?: string
} = {}) {
  const headers: Record<string, string> = { host }
  if (contentType !== undefined) headers['content-type'] = contentType
  return {
    method,
    headers,
    url,
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify({ session: 'test-session', ...JSON.parse(body) })
    },
  }
}

function fakeRes() {
  return {
    status: 0,
    payload: '',
    writeHead(status: number) { this.status = status },
    end(payload: string) { this.payload = payload },
  }
}

describe('git-remotes routes', () => {
  it('rejects an unauthenticated loopback request despite a forged cookie name', async () => {
    const repo = await makeRepo()
    const res = fakeRes()
    const req = fakeReq({ url: `${API_PREFIX}/status` })
    req.headers.cookie = 'dsh-auth-forged=anything'
    await fakeCtx(repo.root, 401).handler?.(req, res)
    expect(res.status).toBe(401)
  })

  it('accepts only the private carrier request recognized by the owning host', async () => {
    const repo = await makeRepo()
    const privateRequest = fakeReq({ url: `${API_PREFIX}/status` })
    const handler = fakeCtx(repo.root, 401, privateRequest).handler
    const allowed = fakeRes()
    await handler?.(privateRequest, allowed)
    expect(allowed.status).toBe(200)
    const rejected = fakeRes()
    await handler?.(fakeReq({ url: `${API_PREFIX}/status` }), rejected)
    expect(rejected.status).toBe(401)
  })

  it('GET is 405', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(fakeReq({ method: 'GET' }), res)
    expect(res.status).toBe(405)
    expect(JSON.parse(res.payload).error.code).toBe('method-error')
  })

  it('rejects non-JSON content-type (CSRF)', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(fakeReq({ contentType: 'text/plain' }), res)
    expect(res.status).toBe(415)
  })

  it('rejects a missing Host (trust fence)', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: `${API_PREFIX}/status`,
      async *[Symbol.asyncIterator]() { yield '{}' },
    }
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(req, res)
    expect(res.status).toBe(403)
  })

  it('status returns remotes', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare])
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(fakeReq({ url: `${API_PREFIX}/status`, body: '{}' }), res)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.payload) as { ok: boolean; value: { remotes: Array<{ name: string }> } }
    expect(body.ok).toBe(true)
    expect(body.value.remotes.map(entry => entry.name)).toEqual(['origin'])
  })

  it('fetch --all succeeds', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare])
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(
      fakeReq({ url: `${API_PREFIX}/fetch`, body: '{"remote":"","prune":false}' }),
      res,
    )
    expect(res.status).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true, value: { done: true } })
    expect((await runGit(repo.root, ['log', '-1', '--format=%s', 'refs/remotes/origin/main'])).trim()).toBe('r1')
  })

  it('push without confirm is 400 and does not push', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare])
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(
      fakeReq({ url: `${API_PREFIX}/push`, body: '{"remote":"origin"}' }),
      res,
    )
    expect(res.status).toBe(400)
    expect(JSON.parse(res.payload).error.code).toBe('confirm-required')
    expect((await runGit(bare, ['log', '-1', '--format=%s', 'refs/heads/main'])).trim()).toBe('r1')
  })

  it('force: true is rejected', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const res = fakeRes()
    await fakeCtx(repo.root).handler?.(
      fakeReq({ url: `${API_PREFIX}/push`, body: '{"confirm":true,"force":true}' }),
      res,
    )
    expect(res.status).toBe(400)
    expect(JSON.parse(res.payload).error.code).toBe('force-push-disabled')
  })

  it('not a git repository is a stable error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-git-remotes-nogit-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    const res = fakeRes()
    await fakeCtx(root).handler?.(fakeReq({ url: `${API_PREFIX}/fetch`, body: '{}' }), res)
    expect(res.status).toBe(400)
    expect(JSON.parse(res.payload).error.message).toMatch(/not a git repository/)
  })
})
