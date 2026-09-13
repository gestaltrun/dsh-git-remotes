import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import { inject as clientInject } from '../src/client/inject.ts'
import { ERROR_COPY } from '../src/client/api.ts'

describe('plugin export shape', () => {
  it('is a namespace plugin (no default export)', () => {
    expect('default' in plugin).toBe(false)
    expect(plugin.name).toBe('dsh-git-remotes')
    expect(plugin.inject).toEqual(['webServer', 'sessions', 'sessionPersistence', 'webRuntime', 'connection'])
    expect(typeof plugin.apply).toBe('function')
  })

  it('keeps the client inactive without betterSidebar', () => {
    expect(clientInject).toEqual(['betterSidebar'])
  })

  it('does not register a model-facing tool', () => {
    const manifest = JSON.parse(readFileSync(new URL('../dsh.plugin.json', import.meta.url), 'utf8')) as {
      contributes: { tools: unknown[] }
    }
    expect(manifest.contributes.tools).toEqual([])
  })

  it('has copy for the classified push/pull codes', () => {
    expect(ERROR_COPY['confirm-required']).toBeTruthy()
    expect(ERROR_COPY['non-ff']).toBeTruthy()
    expect(ERROR_COPY['force-push-disabled']).toBeTruthy()
  })
})
