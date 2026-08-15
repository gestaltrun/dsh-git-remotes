import { describe, expect, it } from 'vitest'
import { validateRemoteName } from '../src/remote-name.ts'

describe('validateRemoteName', () => {
  it('accepts ordinary remote names', () => {
    for (const name of ['origin', 'gitee', 'my_remote-2', 'a.b']) {
      expect(validateRemoteName(name), name).toBe(true)
    }
  })

  it('rejects empty, path-like, dotted, or overlong names', () => {
    for (const bad of ['', 'a/b', 'a b', 'a..b', '.a', 'a.', 'x'.repeat(201)]) {
      expect(validateRemoteName(bad), bad).toBe(false)
    }
  })
})
