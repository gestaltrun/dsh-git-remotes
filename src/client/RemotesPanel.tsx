/**
 * Git Remotes tab: branch / upstream / ahead-behind, remote picker,
 * fetch (optional prune), ff-only pull, and a two-step confirmed push.
 * Does not stage, commit, or force-push — those stay in better-sidebar Git.
 */
import { useCallback, useEffect, useState } from 'react'
import type { GitRemotesTabComponentProps } from '../context-types.ts'
import { GitRemotesApiError, gitRemotesApi, messageForError, type RemoteStatus } from './api.ts'
import css from './remotes-panel.module.css'

type Busy = 'idle' | 'status' | 'fetch' | 'pull' | 'push'

export function RemotesPanel(props: GitRemotesTabComponentProps) {
  const sessionId = props.scope.sessionId
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [remote, setRemote] = useState('')
  const [prune, setPrune] = useState(true)
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [confirmPush, setConfirmPush] = useState(false)

  const refresh = useCallback(async () => {
    setBusy('status')
    setError(null)
    try {
      const next = await gitRemotesApi.status(sessionId)
      setStatus(next)
      setRemote((current) => {
        if (current === '') return ''
        if (next.remotes.some(entry => entry.name === current)) return current
        return ''
      })
    } catch (caught) {
      setError(caught instanceof GitRemotesApiError ? messageForError(caught) : String(caught))
    } finally {
      setBusy('idle')
    }
  }, [sessionId])

  useEffect(() => {
    if (!props.visible) return
    void refresh()
  }, [props.visible, refresh])

  const run = async (kind: Exclude<Busy, 'idle' | 'status'>, work: () => Promise<unknown>, success: string) => {
    setBusy(kind)
    setError(null)
    setOk(null)
    setConfirmPush(false)
    try {
      await work()
      setOk(success)
      await refresh()
    } catch (caught) {
      setError(caught instanceof GitRemotesApiError ? messageForError(caught) : String(caught))
    } finally {
      setBusy('idle')
    }
  }

  if (status !== null && !status.isRepo) {
    return (
      <div className={css.root}>
        <p className={css.empty}>当前工作区不是 git 仓库。</p>
      </div>
    )
  }

  const disabled = busy !== 'idle'
  const target = remote === '' ? '全部远程' : remote
  const pushTarget = status?.upstream ?? (remote !== '' ? `${remote} (设置上游)` : '（无上游，请选远程）')

  return (
    <div className={css.root}>
      <section className={css.section}>
        <div className={css.label}>当前分支</div>
        <div className={css.row}>
          <span className={css.branch}>
            {status?.detached === true ? '游离 HEAD' : (status?.branch ?? '…')}
          </span>
          {status?.upstream !== null && status?.upstream !== undefined && (
            <span className={css.muted}>↑ {status.upstream}</span>
          )}
        </div>
        {status?.upstreamGone === true && (
          <div className={css.gone}>上游跟踪已失效（远程分支已删除）。Fetch + prune 可清掉残留 ref。</div>
        )}
        {status !== null && status.upstream !== null && !status.upstreamGone && (
          <div className={css.counts}>
            ahead {status.ahead} · behind {status.behind}
          </div>
        )}
      </section>

      <section className={css.section}>
        <div className={css.label}>远程</div>
        {status === null || status.remotes.length === 0 ? (
          <p className={css.empty}>没有配置 remote。先在终端 `git remote add`。</p>
        ) : (
          <div className={css.remoteList}>
            <button
              type="button"
              className={`${css.remoteItem} ${remote === '' ? css.remoteItemActive : ''}`}
              onClick={() => setRemote('')}
              disabled={disabled}
            >
              <span className={css.remoteName}>全部</span>
              <span className={css.remoteUrl}>git fetch --all</span>
            </button>
            {status.remotes.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={`${css.remoteItem} ${remote === entry.name ? css.remoteItemActive : ''}`}
                onClick={() => setRemote(entry.name)}
                disabled={disabled}
              >
                <span className={css.remoteName}>{entry.name}</span>
                <span className={css.remoteUrl}>{entry.fetchUrl || entry.pushUrl}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <label className={css.prune}>
        <input
          type="checkbox"
          checked={prune}
          disabled={disabled}
          onChange={(event) => setPrune(event.target.checked)}
        />
        Fetch 时 prune 失效跟踪分支
      </label>

      <div className={css.actions}>
        <button
          type="button"
          className={css.button}
          disabled={disabled}
          onClick={() => void run('fetch', () => gitRemotesApi.fetch(sessionId, remote, prune), `已 fetch ${target}`)}
        >
          Fetch{prune ? ' + prune' : ''}
        </button>
        <button
          type="button"
          className={css.button}
          disabled={disabled}
          onClick={() => void run('pull', () => gitRemotesApi.pull(sessionId, remote), '已快进 pull')}
        >
          Pull --ff-only
        </button>
        <button
          type="button"
          className={`${css.button} ${css.primary}`}
          disabled={disabled}
          onClick={() => { setConfirmPush(true); setOk(null); setError(null) }}
        >
          Push…
        </button>
        <button type="button" className={css.button} disabled={disabled} onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {confirmPush && (
        <div className={css.confirm}>
          <div>将推送到 {pushTarget}。不会 force-push，也不会把凭据写进会话日志。</div>
          <div className={css.actions}>
            <button
              type="button"
              className={`${css.button} ${css.primary}`}
              disabled={disabled}
              onClick={() => void run('push', () => gitRemotesApi.push(sessionId, remote), '已推送')}
            >
              确认推送
            </button>
            <button type="button" className={css.button} disabled={disabled} onClick={() => setConfirmPush(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {error !== null && <div className={css.error}>{error}</div>}
      {ok !== null && <div className={css.ok}>{ok}</div>}
    </div>
  )
}
