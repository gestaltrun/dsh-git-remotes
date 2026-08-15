import { describe, expect, it } from 'vitest'
import { redactRemoteUrl } from '../src/redact.ts'

describe('redactRemoteUrl', () => {
  it('strips HTTPS user:token from URLs', () => {
    expect(redactRemoteUrl('https://x-access-token:ghs_secret@github.com/org/repo.git'))
      .toBe('https://x-access-token:***@github.com/org/repo.git')
  })

  it('redacts credentials inside git stderr text', () => {
    const stderr = "fatal: unable to access 'https://user:p%40ss@example.com/repo.git/': Authentication failed"
    expect(redactRemoteUrl(stderr)).toContain('https://user:***@example.com/repo.git/')
    expect(redactRemoteUrl(stderr)).not.toContain('p%40ss')
  })

  it('leaves SSH URLs unchanged', () => {
    expect(redactRemoteUrl('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git')
  })
})
