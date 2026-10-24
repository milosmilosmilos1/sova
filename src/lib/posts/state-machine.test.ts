import { describe, expect, it } from 'vitest'

import {
  availableActions,
  canTransition,
  checkAction,
  isServiceOnly,
  POST_TRANSITIONS,
  targetStatusFor,
  validateScheduleTime,
} from './state-machine'

describe('state machine objava', () => {
  it('matrica prelaza prati SCHEMA.md', () => {
    expect(canTransition('draft', 'in_review')).toBe(true)
    expect(canTransition('draft', 'published')).toBe(false)
    expect(canTransition('in_review', 'approved')).toBe(true)
    expect(canTransition('approved', 'scheduled')).toBe(true)
    expect(canTransition('scheduled', 'publishing')).toBe(true)
    expect(canTransition('publishing', 'draft')).toBe(false)
    expect(canTransition('published', 'draft')).toBe(false)
    expect(POST_TRANSITIONS.published).toEqual([])
    expect(isServiceOnly('scheduled', 'publishing')).toBe(true)
    expect(isServiceOnly('draft', 'in_review')).toBe(false)
  })
  it('uloge: editor šalje na odobrenje ali ne odobrava; approver odobrava ali ne zakazuje iz nacrta; admin zakazuje bez odobrenja', () => {
    expect(checkAction('submit', 'draft', 'editor').ok).toBe(true)
    expect(checkAction('approve', 'in_review', 'editor')).toMatchObject({ ok: false, reason: 'role' })
    expect(checkAction('approve', 'in_review', 'approver').ok).toBe(true)
    expect(checkAction('schedule', 'draft', 'editor')).toMatchObject({ ok: false, reason: 'admin_only' })
    expect(checkAction('schedule', 'draft', 'owner').ok).toBe(true)
    expect(checkAction('schedule', 'approved', 'editor').ok).toBe(true)
    expect(checkAction('schedule', 'in_review', 'owner')).toMatchObject({ ok: false, reason: 'status' })
    expect(checkAction('delete', 'draft', 'editor')).toMatchObject({ ok: false, reason: 'role' })
    expect(checkAction('delete', 'scheduled', 'owner')).toMatchObject({ ok: false, reason: 'status' })
    expect(checkAction('edit', 'publishing', 'owner').ok).toBe(false)
    expect(availableActions('draft', 'viewer')).toEqual([])
    expect(availableActions('in_review', 'approver')).toEqual(['approve', 'reject', 'request_changes'])
    expect(availableActions('scheduled', 'editor').sort()).toEqual(['cancel', 'pause', 'unschedule'])
  })
  it('status targeta prati objavu', () => {
    expect(targetStatusFor('scheduled', 'pending')).toBe('scheduled')
    expect(targetStatusFor('scheduled', 'needs_reauth')).toBe('needs_reauth')
    expect(targetStatusFor('draft', 'scheduled')).toBe('pending')
    expect(targetStatusFor('draft', 'published')).toBe('published')
    expect(targetStatusFor('canceled', 'scheduled')).toBe('canceled')
  })
  it('vreme zakazivanja: prošlost i više od godinu dana se odbijaju (K1)', () => {
    const now = new Date('2026-10-24T10:00:00Z')
    expect(validateScheduleTime(new Date('2026-10-24T09:00:00Z'), now).ok).toBe(false)
    expect(validateScheduleTime(new Date('2026-10-24T09:59:30Z'), now).ok).toBe(true) // tolerancija 60 s
    expect(validateScheduleTime(new Date('2026-10-25T10:00:00Z'), now).ok).toBe(true)
    expect(validateScheduleTime(new Date('2028-01-01T10:00:00Z'), now).ok).toBe(false)
    expect(validateScheduleTime(new Date('nije datum'), now).ok).toBe(false)
  })
})
