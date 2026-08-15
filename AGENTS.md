# AGENTS.md — dsh-git-remotes

Official-dsh **web** plugin (Cordis bundle + better-sidebar tab). Not part of `dsh-tianshu-build`.

## Do

- Dual-half like `dsh-sidebar-qa`: host `lib/index.js`, client `lib/client.js` + `lib/client-registry.js`.
- Git spawn like `dsh-git-status`: `-C`, argv, no shell, `LC_ALL=C`, 120s for fetch/pull/push.
- `path.resolve` before any root comparison (Windows slash).
- Redact `user:pass@` in remote URLs and git stderr.
- Push only when JSON `confirm: true`. Never `--force`.
- Keep `contributes.tools` empty.

## Don't

- Don't replace better-sidebar's Git tab (stage/commit).
- Don't register a model tool that can push.
- Don't depend on `dsh-better-sidebar` as a hard runtime package — optional peer; client `inject = ['betterSidebar']`.
- Don't import `@deepseek-ai/*` values in the client bundle (purity gate).
- Don't mix another product into this repo.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
```
