import { describe, expect, it } from 'vitest'
import {
  classifyFetchFailure,
  classifyPullFailure,
  classifyPushFailure,
} from '../src/classify.ts'

describe('classifyFetchFailure', () => {
  it('maps DNS / connect failures to network-error', () => {
    const cases = [
      "fatal: unable to access 'https://x.example/repo.git/': Could not resolve host: x.example",
      'ssh: connect to host x.example port 22: Connection refused',
      "fatal: unable to access 'https://x.example/': Failed to connect to x.example port 443: Connection timed out",
    ]
    for (const stderr of cases) {
      expect(classifyFetchFailure(stderr).code, stderr).toBe('network-error')
    }
  })

  it('maps credential failures to authentication-error', () => {
    const cases = [
      "fatal: Authentication failed for 'https://x.example/repo.git/'",
      'git@x.example: Permission denied (publickey).',
      'fatal: could not read Username for https://example.com: terminal prompts disabled',
    ]
    for (const stderr of cases) {
      expect(classifyFetchFailure(stderr).code, stderr).toBe('authentication-error')
    }
  })

  it('redacts tokens in the returned message', () => {
    const classified = classifyFetchFailure(
      "fatal: Authentication failed for 'https://user:ghs_secret@github.com/org/repo.git/'",
    )
    expect(classified.code).toBe('authentication-error')
    expect(classified.message).not.toContain('ghs_secret')
    expect(classified.message).toContain('***')
  })

  it('maps missing remote repo to remote-unreachable', () => {
    const stderr = [
      "fatal: 'nope' does not appear to be a git repository",
      'fatal: Could not read from remote repository.',
    ].join('\n')
    expect(classifyFetchFailure(stderr).code).toBe('remote-unreachable')
  })

  it('falls back to internal', () => {
    expect(classifyFetchFailure('fatal: unknown switch `q`').code).toBe('internal')
  })
})

describe('classifyPullFailure', () => {
  it('maps diverged histories to non-ff', () => {
    expect(classifyPullFailure('fatal: Not possible to fast-forward, aborting.').code).toBe('non-ff')
  })

  it('maps missing upstream', () => {
    expect(classifyPullFailure('There is no tracking information for the current branch.').code).toBe('no-upstream')
  })
})

describe('classifyPushFailure', () => {
  it('maps rejected non-fast-forward', () => {
    expect(classifyPushFailure('! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs').code)
      .toBe('rejected-non-ff')
  })
})
