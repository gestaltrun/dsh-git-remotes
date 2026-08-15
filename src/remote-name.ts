/**
 * Remote *name* validation (not a ref). Git remote names cannot contain `/`.
 * Same shape as dsh-git-status: keep argv injection off the git command line.
 */
export function validateRemoteName(name: string): boolean {
  return typeof name === 'string'
    && name.length <= 200
    && name.length > 0
    && /^[0-9A-Za-z._-]+$/.test(name)
    && !name.startsWith('.')
    && !name.endsWith('.')
    && !name.includes('..')
}
