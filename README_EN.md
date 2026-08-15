# dsh-git-remotes

[**简体中文**](README.md) · **English**

A DeepSeek Harness **web** plugin that adds a **Git Remotes** tab to [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar).

The built-in Git tab already stages, commits, and discards. This plugin does **not** replace it. It fills the remote gap:

- branch, upstream, ahead/behind, remotes
- `git fetch` (all remotes or one name; prune stale tracking refs by default)
- `git pull --ff-only` (diverged histories become a human-readable error, never an implicit merge)
- `git push` only after an in-tab confirm (**no** force-push, **no** model-facing auto-push tool)

## Install

Install better-sidebar first, then this plugin on the official web profile:

```sh
dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add git+https://github.com/yq04/dsh-git-remotes.git
```

Without better-sidebar the host routes still mount; the client declares `inject = ['betterSidebar']` so the tab stays inactive. Remove with:

```sh
dsh plugin --profile web remove dsh-git-remotes
dsh plugin --profile web --dump-config
```

Requires system `git`. Credentials stay in your existing helper / SSH agent. The plugin never stores tokens and redacts `user:pass` in error text.

## Boundaries

| Does | Does not |
|---|---|
| fetch / ff-only pull / confirmed push | stage, commit, revert (use the built-in Git tab) |
| validate remote names before argv | shell interpolation, `--force` |
| POST + `application/json` + Host trust fence | register a model push tool |
| prune `[gone]` tracking refs | delete local branches automatically |

Push requires `confirm: true`. That constraint is borrowed from [Claude Code](https://github.com/anthropics/claude-code)'s bundled `commit-commands` plugin: `/commit-push-pr` is **human-started**. This plugin uses a sidebar confirm instead of a slash command, and it does not call `gh pr create`. Default fetch prune matches what `/clean_gone` needs (`git fetch --prune` first).

## Develop

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`dsh.bundle.patch` is `cordis.patch.yml`. GitHub topics already set: `dsh`, `dsh-plugin`, `dsh-better-sidebar`, `git`.

## License

BSD-3-Clause (same as the official plugin-template).
