import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../src/git.ts'
import type { Context } from '../src/context-types.ts'

function context(live: Record<string, string>, cold: Record<string, string> = {}) {
  return {
    sessions: { get: (id: string) => live[id] ? { header: { cwd: live[id] } } : undefined },
    sessionPersistence: { stat: async (id: string) => cold[id] ? { header: { cwd: cold[id] } } : undefined },
  } as unknown as Context
}

describe('session workspace selection', () => {
  it('rejects an unknown session instead of selecting the host checkout', async () => {
    await expect(Promise.resolve().then(() => workspaceRoot(context({}), 'missing'))).rejects.toThrow(/session/)
  })
  it('selects live and cold session workspaces independently', async () => {
    const ctx = context({ first: '/tmp/project-a' }, { second: '/tmp/project-b' })
    expect(await workspaceRoot(ctx, 'first')).toBe('/tmp/project-a')
    expect(await workspaceRoot(ctx, 'second')).toBe('/tmp/project-b')
  })
  it('rejects missing and relative workspaces', async () => {
    await expect(Promise.resolve().then(() => workspaceRoot(context({}), ''))).rejects.toThrow(/session/)
    await expect(Promise.resolve().then(() => workspaceRoot(context({ wrong: '../outside' }), 'wrong'))).rejects.toThrow(/workspace/)
  })
})
