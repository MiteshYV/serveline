import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UNKNOWN_IP, clientIpKey } from './client-ip.ts'

/** Finding otp-per-ip-limit-keyed-on-client-supplied-header. */
describe('clientIpKey', () => {
  it('behind one trusted proxy, ignores everything the caller wrote', () => {
    // The proxy appends what it saw; the three elements in front are the caller's invention.
    assert.equal(clientIpKey('1.1.1.1, 2.2.2.2, 9.9.9.9, 203.0.113.9', 1), '203.0.113.9')
    assert.equal(clientIpKey('evil, 203.0.113.9', 1), '203.0.113.9')
    assert.equal(clientIpKey('203.0.113.9', 1), '203.0.113.9')
    // Two proxies: the second from the end is the address the outer one observed.
    assert.equal(clientIpKey('spoof, 203.0.113.9, 10.0.0.1', 2), '203.0.113.9')
  })

  it('with no trusted proxy, accepts only the single element Next fills in', () => {
    assert.equal(clientIpKey('203.0.113.9', 0), '203.0.113.9')
    // A list longer than one was shaped by the caller, so it buys nothing.
    assert.equal(clientIpKey('1.1.1.1, 203.0.113.9', 0), UNKNOWN_IP)
  })

  it('fails closed on anything that is not an address', () => {
    assert.equal(clientIpKey(null, 1), UNKNOWN_IP)
    assert.equal(clientIpKey('', 1), UNKNOWN_IP)
    assert.equal(clientIpKey('   ', 1), UNKNOWN_IP)
    assert.equal(clientIpKey('not-an-ip', 0), UNKNOWN_IP)
    assert.equal(clientIpKey('203.0.113.9, not-an-ip', 1), UNKNOWN_IP)
    // More hops configured than the header holds: the trusted element is missing, not guessable.
    assert.equal(clientIpKey('203.0.113.9', 3), UNKNOWN_IP)
  })

  it('accepts IPv6, which a mobile network hands out as often as IPv4', () => {
    assert.equal(clientIpKey('spoof, 2001:db8::1', 1), '2001:db8::1')
  })

  it('reads TRUSTED_PROXY_HOPS when no hop count is passed', () => {
    const before = process.env.TRUSTED_PROXY_HOPS
    try {
      process.env.TRUSTED_PROXY_HOPS = '1'
      assert.equal(clientIpKey('1.1.1.1, 203.0.113.9'), '203.0.113.9')
      delete process.env.TRUSTED_PROXY_HOPS
      assert.equal(clientIpKey('1.1.1.1, 203.0.113.9'), UNKNOWN_IP, 'default is no trusted proxy')
    } finally {
      if (before === undefined) delete process.env.TRUSTED_PROXY_HOPS
      else process.env.TRUSTED_PROXY_HOPS = before
    }
  })
})
