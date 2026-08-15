/**
 * Windows-safe path confinement. Always `path.resolve` before comparing —
 * mixed `C:/` vs `C:\` prefixes make `startsWith` lie (dsh-plugin-dev).
 */
import { isAbsolute, relative, resolve } from 'node:path'

/** Resolve a workspace cwd to a canonical absolute path. */
export function resolvedWorkspaceRoot(cwd: string): string {
  return resolve(cwd)
}

/**
 * Whether `candidate` is `root` or a descendant, after resolving both.
 * Uses `path.relative` so slash direction does not matter.
 */
export function isPathInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
