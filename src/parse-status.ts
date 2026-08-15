/**
 * Parse the first line of `git status -sb` (short + branch).
 * File rows after the header are ignored — this tab is remotes, not the
 * built-in Git stage/commit view.
 */
export interface StatusSb {
  branch: string | null
  detached: boolean
  upstream: string | null
  upstreamGone: boolean
  ahead: number
  behind: number
  noCommits: boolean
}

function parseBracket(info: string | undefined): { gone: boolean; ahead: number; behind: number } {
  if (info === undefined || info === '') {
    return { gone: false, ahead: 0, behind: 0 }
  }
  if (info === 'gone' || info.startsWith('gone')) {
    return { gone: true, ahead: 0, behind: 0 }
  }
  const aheadMatch = /ahead (\d+)/.exec(info)
  const behindMatch = /behind (\d+)/.exec(info)
  return {
    gone: false,
    ahead: aheadMatch !== null ? Number(aheadMatch[1]) : 0,
    behind: behindMatch !== null ? Number(behindMatch[1]) : 0,
  }
}

/** Parse `git status -sb` stdout into branch / upstream / ahead-behind. */
export function parseStatusSb(output: string): StatusSb {
  const empty: StatusSb = {
    branch: null,
    detached: false,
    upstream: null,
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    noCommits: false,
  }
  const header = output.split(/\r?\n/).find(line => line.startsWith('## '))
  if (header === undefined) return empty
  const line = header.slice(3)

  if (line === 'HEAD (no branch)' || line.startsWith('HEAD (no branch)')) {
    return { ...empty, detached: true }
  }

  const noCommits = line.startsWith('No commits yet on ')
  const rest = noCommits ? line.slice('No commits yet on '.length) : line

  const tracking = /^(\S+?)\.\.\.(\S+)(?: \[(.+)\])?$/.exec(rest)
  if (tracking !== null) {
    const counts = parseBracket(tracking[3])
    return {
      branch: tracking[1] ?? null,
      detached: false,
      upstream: tracking[2] ?? null,
      upstreamGone: counts.gone,
      ahead: counts.ahead,
      behind: counts.behind,
      noCommits,
    }
  }

  const plain = /^(\S+)(?: \[(.+)\])?$/.exec(rest)
  if (plain !== null) {
    const counts = parseBracket(plain[2])
    return {
      branch: plain[1] ?? null,
      detached: false,
      upstream: null,
      upstreamGone: counts.gone,
      ahead: counts.ahead,
      behind: counts.behind,
      noCommits,
    }
  }

  return { ...empty, noCommits }
}
