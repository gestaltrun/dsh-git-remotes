import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInsideRoot, resolvedWorkspaceRoot } from '../src/path-guard.ts'

describe('path-guard', () => {
  it('treats mixed slash prefixes as the same root after resolve', () => {
    const root = resolvedWorkspaceRoot(process.cwd())
    expect(isPathInsideRoot(root, join(root, 'src'))).toBe(true)
  })

  it('rejects a path that escapes with ..', () => {
    const root = resolvedWorkspaceRoot(process.cwd())
    expect(isPathInsideRoot(root, join(root, '..', 'outside'))).toBe(false)
  })

  it('accepts the root itself', () => {
    const root = resolvedWorkspaceRoot(process.cwd())
    expect(isPathInsideRoot(root, root)).toBe(true)
  })
})
