import { describe, expect, it } from 'vitest'
import { isLoopbackHostname, isTrustedApiRequest } from '../src/trust-fence.ts'

describe('trust fence', () => {
  it('accepts loopback Host without Origin', () => {
    expect(isTrustedApiRequest({ headers: { host: '127.0.0.1:8080' } }, [])).toBe(true)
    expect(isLoopbackHostname('localhost')).toBe(true)
  })

  it('rejects missing Host', () => {
    expect(isTrustedApiRequest({ headers: {} }, [])).toBe(false)
  })

  it('rejects cross-site sec-fetch-site', () => {
    expect(isTrustedApiRequest({
      headers: { host: '127.0.0.1:8080', 'sec-fetch-site': 'cross-site' },
    }, [])).toBe(false)
  })

  it('rejects Origin that does not match Host', () => {
    expect(isTrustedApiRequest({
      headers: { host: '127.0.0.1:8080', origin: 'https://evil.example' },
    }, [])).toBe(false)
  })
})
