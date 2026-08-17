/**
 * TD-053: the failure taxonomy exists so the renderer can branch on a
 * field. The load-bearing cases are the two the renderer treats
 * differently from everything else — `unauthorized`, which must trigger
 * reauthentication, and a tool that legitimately found nothing, which
 * must not be a failure at all.
 */

import { describe, expect, it } from 'vitest'
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpFailureError, toMcpFailure, toolResultFailure } from '../errors'

function text(value: string): CallToolResult['content'] {
  return [{ type: 'text', text: value }]
}

describe('toMcpFailure (TD-053)', () => {
  // ─── unauthorized ─────────────────────────────────────────────────

  it('maps a 401 from the transport to unauthorized', () => {
    const failure = toMcpFailure(new StreamableHTTPError(401, 'Unauthorized'))
    expect(failure.kind).toBe('unauthorized')
  })

  it('maps a 403 from the transport to unauthorized', () => {
    expect(toMcpFailure(new StreamableHTTPError(403, 'Forbidden')).kind).toBe('unauthorized')
  })

  it('passes an already-classified failure straight through', () => {
    const original = new McpFailureError({ kind: 'unauthorized', message: 'no token stored' })
    expect(toMcpFailure(original)).toEqual({ kind: 'unauthorized', message: 'no token stored' })
  })

  // ─── unreachable ──────────────────────────────────────────────────

  it('maps a DNS failure to unreachable', () => {
    const error = new TypeError('fetch failed')
    error.cause = Object.assign(new Error('getaddrinfo ENOTFOUND halo-mcp.swaff.name'), {
      code: 'ENOTFOUND'
    })
    expect(toMcpFailure(error).kind).toBe('unreachable')
  })

  it('maps a refused connection to unreachable', () => {
    expect(toMcpFailure(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })).kind).toBe(
      'unreachable'
    )
  })

  it('maps the request timeout to unreachable', () => {
    const error = new McpError(ErrorCode.RequestTimeout, 'Request timed out')
    expect(toMcpFailure(error).kind).toBe('unreachable')
  })

  it('maps a closed connection to unreachable', () => {
    const error = new McpError(ErrorCode.ConnectionClosed, 'Connection closed')
    expect(toMcpFailure(error).kind).toBe('unreachable')
  })

  // ─── protocol ─────────────────────────────────────────────────────

  it('maps a non-auth HTTP status to protocol', () => {
    expect(toMcpFailure(new StreamableHTTPError(404, 'Not Found')).kind).toBe('protocol')
  })

  it('maps malformed JSON-RPC to protocol', () => {
    expect(toMcpFailure(new McpError(ErrorCode.ParseError, 'Parse error')).kind).toBe('protocol')
  })

  it('keeps the original message so the smoke script can print it', () => {
    expect(toMcpFailure(new Error('unexpected')).message).toBe('unexpected')
  })
})

describe('toolResultFailure (TD-053)', () => {
  it('maps an isError result to tool_error and keeps its content', () => {
    const content = text('limit must be between 1 and 100')
    expect(toolResultFailure({ content, isError: true })).toEqual({
      kind: 'tool_error',
      message: 'limit must be between 1 and 100',
      content
    })
  })

  it('maps a session-expired message to unauthorized on an HTTP 200', () => {
    const result = { content: text('Your session has expired. Sign in again.'), isError: true }
    expect(toolResultFailure(result)?.kind).toBe('unauthorized')
  })

  // ─── Not failures ─────────────────────────────────────────────────

  it('treats an empty result as a valid answer, not an error', () => {
    expect(toolResultFailure({ content: [], isError: false })).toBeNull()
    expect(toolResultFailure({ content: text('[]') })).toBeNull()
  })

  it('does not read auth prose out of successful catalogue content', () => {
    expect(toolResultFailure({ content: text('Record: "Unauthorized" (1997)') })).toBeNull()
  })

  it('treats a tool error quoting a bare status code as a tool error, not a dead session', () => {
    const result = { content: text('Upstream record 401 could not be fetched.'), isError: true }
    expect(toolResultFailure(result)?.kind).toBe('tool_error')
  })
})
