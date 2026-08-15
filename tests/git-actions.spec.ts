import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { onTestFinished } from 'vitest'
import {
  gitFetchAction,
  gitPullAction,
  gitPushAction,
  gitRemoteList,
  gitRemoteStatus,
} from '../src/git.ts'
import { makeRemote, makeRepo, runGit } from './fixtures/repo.ts'

async function cloneFrom(bare: string) {
  const dest = await makeRepo()
  await dest.git(['remote', 'add', 'origin', bare])
  await dest.git(['fetch', 'origin'])
  await dest.git(['checkout', '-B', 'main', 'origin/main'])
  await dest.git(['branch', '--set-upstream-to=origin/main'])
  return dest
}

describe('gitRemoteStatus', () => {
  it('reports remotes and ahead/behind after a fetch', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await cloneFrom(bare)
    await repo.commit('local-ahead')
    const status = await gitRemoteStatus(repo.root)
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.upstream).toBe('origin/main')
    expect(status.ahead).toBe(1)
    expect(status.behind).toBe(0)
    expect(status.remotes.map(entry => entry.name)).toEqual(['origin'])
    expect(status.remotes[0]?.fetchUrl).not.toContain('://user:')
  })

  it('returns isRepo false outside a git directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-git-remotes-nogit-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    const status = await gitRemoteStatus(root)
    expect(status.isRepo).toBe(false)
  })
})

describe('gitFetchAction', () => {
  it('fetch --all updates origin', async () => {
    const bare = await makeRemote(['r1', 'r2'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare])
    const result = await gitFetchAction(repo.root, { prune: false })
    expect(result).toEqual({ ok: true })
    expect((await runGit(repo.root, ['log', '-1', '--format=%s', 'refs/remotes/origin/main'])).trim()).toBe('r2')
  })

  it('fetches only the named remote', async () => {
    const bare1 = await makeRemote(['r1'])
    const bare2 = await makeRemote(['r2'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare1])
    await repo.git(['remote', 'add', 'upstream', bare2])
    const result = await gitFetchAction(repo.root, { remote: 'upstream', prune: false })
    expect(result).toEqual({ ok: true })
    expect((await runGit(repo.root, ['log', '-1', '--format=%s', 'refs/remotes/upstream/main'])).trim()).toBe('r2')
    const origin = await repo.git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], true)
    expect(origin).toMatchObject({ ok: false })
  })

  it('prune=true deletes stale tracking refs', async () => {
    const bare = await makeRemote(['c1'])
    const repo = await makeRepo()
    await repo.commit('local')
    await repo.git(['remote', 'add', 'origin', bare])
    const head = (await runGit(repo.root, ['rev-parse', 'HEAD'])).trim()
    await runGit(repo.root, ['update-ref', 'refs/remotes/origin/gone', head])
    await gitFetchAction(repo.root, { prune: false })
    expect((await repo.git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/gone'], true))).toMatchObject({ ok: true })
    await gitFetchAction(repo.root, { prune: true })
    expect((await repo.git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/gone'], true))).toMatchObject({ ok: false })
  })

  it('rejects an invalid remote name without spawning a path injection', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const result = await gitFetchAction(repo.root, { remote: 'a/b' })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-remote-name' } })
  })

  it('returns remote-not-found without running git fetch', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const result = await gitFetchAction(repo.root, { remote: 'nope' })
    expect(result).toMatchObject({ ok: false, error: { code: 'remote-not-found' } })
  })

  it('lists remotes after add', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    expect(await gitRemoteList(repo.root)).toEqual([])
    await repo.git(['remote', 'add', 'origin', '/tmp/nonexistent-remote'])
    expect(await gitRemoteList(repo.root)).toEqual(['origin'])
  })
})

describe('gitPullAction', () => {
  it('fast-forwards when the remote is strictly ahead', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await cloneFrom(bare)
    const extra = await cloneFrom(bare)
    await extra.commit('r2')
    await extra.git(['push', 'origin', 'main'])
    const result = await gitPullAction(repo.root)
    expect(result).toEqual({ ok: true })
    expect((await runGit(repo.root, ['log', '-1', '--format=%s'])).trim()).toBe('r2')
  })

  it('returns non-ff when histories diverged', async () => {
    const bare = await makeRemote(['base'])
    const repo = await cloneFrom(bare)
    const extra = await cloneFrom(bare)
    await extra.commit('theirs')
    await extra.git(['push', 'origin', 'main'])
    await repo.commit('ours')
    const result = await gitPullAction(repo.root)
    expect(result).toMatchObject({ ok: false, error: { code: 'non-ff' } })
    expect((await runGit(repo.root, ['log', '-1', '--format=%s'])).trim()).toBe('ours')
  })

  it('returns no-upstream when the branch does not track', async () => {
    const repo = await makeRepo()
    await repo.commit('c1')
    const result = await gitPullAction(repo.root)
    expect(result).toMatchObject({ ok: false, error: { code: 'no-upstream' } })
  })
})

describe('gitPushAction', () => {
  it('refuses to push without confirm: true', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await cloneFrom(bare)
    await repo.commit('local')
    const result = await gitPushAction(repo.root, { confirm: false })
    expect(result).toMatchObject({ ok: false, error: { code: 'confirm-required' } })
    expect((await runGit(bare, ['log', '-1', '--format=%s', 'refs/heads/main'])).trim()).toBe('r1')
  })

  it('pushes after confirm: true', async () => {
    const bare = await makeRemote(['r1'])
    const repo = await cloneFrom(bare)
    await repo.commit('local')
    const result = await gitPushAction(repo.root, { confirm: true })
    expect(result).toEqual({ ok: true })
    expect((await runGit(bare, ['log', '-1', '--format=%s', 'refs/heads/main'])).trim()).toBe('local')
  })
})
