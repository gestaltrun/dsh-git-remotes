/** Host services and tab props from the published DSH and Sidebar APIs. */
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { Context as SidebarContext, TabComponentProps } from '@gestaltrun/dsh-better-sidebar';
export type Context = Pick<CordisContext, 'effect' | 'get' | 'connection' | 'webServer' | 'sessions' | 'sessionPersistence'> & Pick<SidebarContext, 'webRuntime' | 'betterSidebar'>;
export type GitRemotesTabComponentProps = TabComponentProps;
