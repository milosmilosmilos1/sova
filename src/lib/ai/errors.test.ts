import { describe, expect, it } from 'vitest'

import { classifyProviderError } from './errors'

const sdkError = (status: number, body: unknown) =>
  Object.assign(new Error(JSON.stringify(body)), { name: 'ApiError', status })

describe('classifyProviderError', () => {
  it('Gemini 504 DEADLINE_EXCEEDED je istek vremena (privremen), ne greška servera', () => {
    const e = classifyProviderError(
      sdkError(504, {
        error: {
          code: 504,
          message: 'Deadline expired before operation could complete.',
          status: 'DEADLINE_EXCEEDED',
        },
      }),
      'gemini-3.8-flash',
    )
    expect(e).toMatchObject({ code: 'TIMEOUT', retryable: true, status: 504, model: 'gemini-3.8-flash' })
  })

  it('429, 404, 500 i 400 zadržavaju svoje klase', () => {
    expect(classifyProviderError(sdkError(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).code).toBe(
      'RATE_LIMITED',
    )
    expect(classifyProviderError(sdkError(404, { error: { message: 'models/x is not found' } })).code).toBe(
      'MODEL_NOT_FOUND',
    )
    expect(classifyProviderError(sdkError(500, { error: { status: 'INTERNAL' } }))).toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: true,
    })
    expect(classifyProviderError(sdkError(400, { error: { status: 'INVALID_ARGUMENT' } }))).toMatchObject({
      code: 'BAD_REQUEST',
      retryable: false,
    })
  })
})
