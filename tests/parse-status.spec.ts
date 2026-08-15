import { describe, expect, it } from 'vitest'
import { parseStatusSb } from '../src/parse-status.ts'

describe('parseStatusSb', () => {
  it('parses ahead and behind against an upstream', () => {
    expect(parseStatusSb('## main...origin/main [ahead 2, behind 1]\n M file.txt')).toEqual({
      branch: 'main',
      detached: false,
      upstream: 'origin/main',
      upstreamGone: false,
      ahead: 2,
      behind: 1,
      noCommits: false,
    })
  })

  it('parses a clean tracking branch', () => {
    expect(parseStatusSb('## main...origin/main')).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
    })
  })

  it('parses [gone] tracking (Claude Code /clean_gone input)', () => {
    expect(parseStatusSb('## feat/x...origin/feat/x [gone]')).toMatchObject({
      branch: 'feat/x',
      upstream: 'origin/feat/x',
      upstreamGone: true,
      ahead: 0,
      behind: 0,
    })
  })

  it('parses a local branch with no upstream', () => {
    expect(parseStatusSb('## main')).toMatchObject({
      branch: 'main',
      upstream: null,
      detached: false,
    })
  })

  it('parses detached HEAD', () => {
    expect(parseStatusSb('## HEAD (no branch)')).toMatchObject({
      branch: null,
      detached: true,
    })
  })

  it('parses no-commits-yet', () => {
    expect(parseStatusSb('## No commits yet on main')).toMatchObject({
      branch: 'main',
      noCommits: true,
    })
  })
})
