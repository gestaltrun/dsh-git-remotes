/**
 * Structural types for the cordis services this plugin consumes. A third-party
 * plugin resolves outside the DSH monorepo's single cordis instance, so
 * upstream `declare module 'cordis'` augmentations do not reach this Context.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export interface GitRemotesWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface GitRemotesWebServer {
  register(route: GitRemotesWebRoute): () => void
}

export interface GitRemotesHostSession {
  header?: { cwd?: string }
}

export interface GitRemotesHostSessions {
  get?(id: string): GitRemotesHostSession | undefined
}

export interface GitRemotesWorkspaceRegistry {
  list?(): Array<{ path?: string }>
}

export interface GitRemotesLoaderEntry {
  options: { name: string; config?: { trustedHosts?: string[] } }
}

export interface GitRemotesLoader {
  entries(): Iterable<GitRemotesLoaderEntry>
}

export interface GitRemotesTabDescriptor {
  id: string
  title: string | (() => string)
  icon?: unknown | ((size: number) => unknown)
  order?: number
  hidden?: boolean
  single?: boolean
  component: (props: GitRemotesTabComponentProps) => unknown
}

export interface GitRemotesTabComponentProps {
  ctx: Context
  scope: { sessionId: string; cwd?: string }
  tab: { id: string; type: string; title: string; path?: string }
  visible: boolean
}

export interface GitRemotesBetterSidebarService {
  registerTab(descriptor: GitRemotesTabDescriptor): () => void
  openTab(seed: { type: string; title?: string; id?: string }): void
}

declare module 'cordis' {
  interface Context {
    webServer: GitRemotesWebServer
    loader: GitRemotesLoader
    sessions: GitRemotesHostSessions
    workspaceRegistry?: GitRemotesWorkspaceRegistry
    betterSidebar: GitRemotesBetterSidebarService
    effect(fn: () => void | (() => void), label?: string): void
  }
}

export type { Context }
