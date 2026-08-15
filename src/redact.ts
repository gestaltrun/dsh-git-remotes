/**
 * Strip credentials from git remote URLs and error text so session logs and
 * the sidebar never echo tokens. HTTPS `user:pass@host` becomes `user:***@host`.
 */
export function redactRemoteUrl(text: string): string {
  return text.replace(/(\/\/[^/\s@:]+):([^/\s@]+)@/g, '$1:***@')
}
