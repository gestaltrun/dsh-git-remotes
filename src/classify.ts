import { redactRemoteUrl } from './redact.ts'

/** One classified git-remote failure for the JSON API. */
export interface ClassifiedError {
  code: string
  message: string
}

function headLine(stderr: string): string {
  const sanitized = redactRemoteUrl(stderr)
  const first = sanitized.trim().split(/\r?\n/)[0]
  return first !== undefined && first !== '' ? first : 'git remote operation failed'
}

/**
 * Shared transport / auth / reachability classification.
 * Auth is checked before network because `unable to access` can be either.
 */
export function classifyRemoteTransport(stderr: string): ClassifiedError | null {
  const message = headLine(stderr)
  if (/authentication failed|permission denied|could not read username|terminal prompts disabled|invalid username or password/i.test(stderr)) {
    return { code: 'authentication-error', message }
  }
  if (/could not resolve|failed to connect|unable to access|connection (timed out|refused)|operation timed out/i.test(stderr)) {
    return { code: 'network-error', message }
  }
  if (/does not appear to be a git repository|could not read from remote repository/i.test(stderr)) {
    return { code: 'remote-unreachable', message }
  }
  return null
}

/** fetch stderr → stable error code. */
export function classifyFetchFailure(stderr: string): ClassifiedError {
  return classifyRemoteTransport(stderr) ?? { code: 'internal', message: headLine(stderr) || 'git fetch failed' }
}

/** pull --ff-only stderr → stable error code. */
export function classifyPullFailure(stderr: string): ClassifiedError {
  const transport = classifyRemoteTransport(stderr)
  if (transport !== null) return transport
  const message = headLine(stderr)
  if (/Not possible to fast-forward|Cannot fast-forward|diverging branches|refusing to merge unrelated histories|Not possible to fast-forward, aborting/.test(stderr)) {
    return { code: 'non-ff', message }
  }
  if (/There is no tracking information|no upstream|You asked to pull from the remote/.test(stderr)) {
    return { code: 'no-upstream', message }
  }
  return { code: 'internal', message: message || 'git pull failed' }
}

/** push stderr → stable error code. Never treats force as success. */
export function classifyPushFailure(stderr: string): ClassifiedError {
  const transport = classifyRemoteTransport(stderr)
  if (transport !== null) return transport
  const message = headLine(stderr)
  if (/non-fast-forward|failed to push some refs|Updates were rejected/.test(stderr)) {
    return { code: 'rejected-non-ff', message }
  }
  if (/has no upstream branch|no upstream/.test(stderr)) {
    return { code: 'no-upstream', message }
  }
  return { code: 'internal', message: message || 'git push failed' }
}
