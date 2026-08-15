import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'

export function runGit(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', root, '--no-pager', '-c', 'color.ui=false', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', LANG: 'C' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `git exited with code ${code}`))
    })
  })
}

export async function runGitSafe(root: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    return { ok: true, stdout: await runGit(root, args), stderr: '' }
  } catch (error) {
    return { ok: false, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

export interface TestRepo {
  root: string
  git: (args: string[], safe?: boolean) => Promise<string | { ok: boolean; stdout: string; stderr: string }>
  commit: (message: string, files?: Record<string, string>) => Promise<void>
}

export async function makeRepo(): Promise<TestRepo> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-remotes-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.name', 'Test User'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
  return {
    root,
    async git(args, safe = false) {
      return safe ? runGitSafe(root, args) : runGit(root, args)
    },
    async commit(message, files = { 'a.txt': message }) {
      for (const [rel, content] of Object.entries(files)) {
        await writeFile(join(root, rel), content, 'utf8')
      }
      await runGit(root, ['add', '-A'])
      await runGit(root, ['commit', '-m', message])
    },
  }
}

export async function makeBareRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-remotes-bare-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await runGit(root, ['init', '--bare', '-b', 'main'])
  return root
}

export async function makeRemote(messages: string[]): Promise<string> {
  const bare = await makeBareRepo()
  const src = await makeRepo()
  for (const message of messages) await src.commit(message)
  await src.git(['remote', 'add', 'origin', bare])
  await src.git(['push', '-u', 'origin', 'main'])
  return bare
}
