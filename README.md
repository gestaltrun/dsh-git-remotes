# @gestaltrun/dsh-git-remotes

基于 [yq04/dsh-git-remotes](https://github.com/yq04/dsh-git-remotes/tree/a9f1729b96e42e38555ddf6042482df8d220453b)，发行包 `0.1.0-gestaltrun.0` 适配 DSH `0.1.5-rc.2` 与 `@gestaltrun/dsh-better-sidebar@0.19.1-gestaltrun.0`。Desktop/Web 共用正式 `betterSidebar` 入口。Host 需要 `webServer`、`webRuntime`、`sessions`、`sessionPersistence`、`connection`；Git 工作目录只来自已知会话的持久或实时 header，未知会话不执行 Git。没有模型工具、preset 或创意工坊依赖。

[**English**](README_EN.md) · **简体中文**

DeepSeek Harness **Web** 插件：在 [dsh-better-sidebar](https://github.com/gestaltrun/better-sidebar) 里增加一个 **Git 远程** Tab。

内置 Git Tab 负责暂存 / 提交 / 丢弃。本插件**不替换**它，只补它没有的远程动作：

- 看当前分支、上游、ahead / behind、remote 列表
- `git fetch`（全部或指定远程；默认 prune 失效跟踪分支）
- `git pull --ff-only`（分叉则报错，不隐式 merge）
- `git push`（面板二次确认；**没有** force-push；**没有**模型工具自动推送）

## 安装

先装 better-sidebar，再装本插件（官方 web profile）：

```sh
dsh plugin --profile web add @gestaltrun/dsh-better-sidebar@0.19.1-gestaltrun.0
dsh plugin --profile web add @gestaltrun/dsh-git-remotes@candidate
```

没有 better-sidebar 时，host 路由仍会挂上，客户端 `inject = ['betterSidebar']`，Tab **不会出现**。卸载：

```sh
dsh plugin --profile web remove @gestaltrun/dsh-git-remotes
dsh plugin --profile web --dump-config
```

需要系统 `git`。推送凭据走你本机已有的 credential helper / SSH agent，插件不存 token，错误信息会把 URL 里的 `user:pass` 打成 `***`。

## 行为边界

| 做 | 不做 |
|---|---|
| fetch / ff-only pull / 确认后 push | 暂存、提交、revert（用内置 Git Tab） |
| 远程名校验后再拼进 argv | shell 拼接、`--force` |
| POST + `application/json` + Host 信任围栏 | 给模型注册 push 工具 |
| prune 清掉 `[gone]` 跟踪 ref | 自动删本地分支 |

Push 必须 `confirm: true`。这是有意学 [Claude Code](https://github.com/anthropics/claude-code) 捆绑插件 `commit-commands` 的用法：`/commit-push-pr` 由**人**发起；本插件把同一约束做成侧边栏按钮，而不是斜杠命令，也不调用 `gh pr create`。Fetch 默认 prune，对应他们的 `/clean_gone` 所依赖的「先 fetch --prune」。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`dsh.bundle.patch` 在 `cordis.patch.yml`。发布前 `pnpm build`（npm `prepare` 会跑 tsdown）。

仓库已打 GitHub topics：`dsh`、`dsh-plugin`、`dsh-better-sidebar`、`git`。

## 许可

BSD-3-Clause（与官方 plugin-template 相同）。
