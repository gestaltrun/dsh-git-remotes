/**
 * Client half: one better-sidebar tab. Inactive until `betterSidebar` exists.
 * No model tools, no auto-push.
 */
import type { Context } from '../context-types.ts'
import { inject } from './inject.ts'
import { RemotesPanel } from './RemotesPanel.tsx'

export { inject }

function RemotesIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 3v10M5 6l3-3 3 3M5 10l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'dsh-git-remotes',
    title: () => 'Git 远程',
    icon: (size: number) => RemotesIcon(size),
    order: 25,
    single: true,
    component: (props) => <RemotesPanel {...props} />,
  }), 'dsh-git-remotes: register sidebar tab')
}
