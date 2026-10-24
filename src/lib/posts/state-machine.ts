import type { WorkspaceRole } from '@/lib/auth/workspace'
import type { Database } from '@/types/database'

/**
 * State machine objava (SCHEMA.md „Dozvoljeni prelazi”). Prva linija odbrane u TypeScript-u;
 * druga je tabela `status_transitions` + trigger `posts_guard`; treća RPC `transition_post`.
 * Ovde su i pravila ko sme koju radnju (uloge iz brifa 8: E editor, P approver, A admin, O owner).
 */
export type PostStatus = Database['public']['Enums']['post_status']
export type TargetStatus = Database['public']['Enums']['target_status']

export const POST_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  draft: ['in_review', 'scheduled', 'canceled'],
  in_review: ['approved', 'rejected', 'draft'],
  approved: ['scheduled', 'draft', 'canceled'],
  rejected: ['draft'],
  scheduled: ['publishing', 'paused', 'canceled', 'draft'],
  paused: ['scheduled', 'canceled'],
  publishing: ['published', 'failed', 'partially_published', 'scheduled'],
  failed: ['scheduled', 'draft', 'canceled'],
  partially_published: ['published', 'failed'],
  published: [],
  canceled: ['draft'],
}

/** Prelazi koje sme samo sistem (publisher), ne korisnik kroz API. */
export const SERVICE_ONLY: Array<[PostStatus, PostStatus]> = [
  ['scheduled', 'publishing'],
  ['publishing', 'published'],
  ['publishing', 'failed'],
  ['publishing', 'partially_published'],
  ['publishing', 'scheduled'],
  ['partially_published', 'published'],
  ['partially_published', 'failed'],
]

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return POST_TRANSITIONS[from].includes(to)
}

export function isServiceOnly(from: PostStatus, to: PostStatus): boolean {
  return SERVICE_ONLY.some(([f, t]) => f === from && t === to)
}

export type PostAction =
  | 'submit' // draft → in_review
  | 'withdraw' // in_review → draft
  | 'approve' // in_review → approved
  | 'reject' // in_review → rejected
  | 'request_changes' // in_review → draft (sa komentarom)
  | 'schedule' // approved|draft|failed|paused → scheduled
  | 'unschedule' // scheduled → draft
  | 'pause' // scheduled → paused
  | 'resume' // paused → scheduled
  | 'cancel' // draft|approved|scheduled|paused|failed → canceled
  | 'restore' // canceled|rejected → draft
  | 'edit' // draft|rejected|canceled|failed (sadržaj); approved → draft
  | 'delete'

const EDITORS: WorkspaceRole[] = ['owner', 'admin', 'editor']
const APPROVERS: WorkspaceRole[] = ['owner', 'admin', 'approver']
const ADMINS: WorkspaceRole[] = ['owner', 'admin']

export interface ActionRule {
  from: PostStatus[]
  to: PostStatus | null
  roles: WorkspaceRole[]
  /** iz kog statusa dodatno smeju samo admini (npr. zakazivanje bez odobrenja) */
  adminOnlyFrom?: PostStatus[]
}

export const ACTION_RULES: Record<PostAction, ActionRule> = {
  submit: { from: ['draft'], to: 'in_review', roles: EDITORS },
  withdraw: { from: ['in_review'], to: 'draft', roles: EDITORS },
  approve: { from: ['in_review'], to: 'approved', roles: APPROVERS },
  reject: { from: ['in_review'], to: 'rejected', roles: APPROVERS },
  request_changes: { from: ['in_review'], to: 'draft', roles: APPROVERS },
  schedule: {
    from: ['approved', 'draft', 'failed', 'paused'],
    to: 'scheduled',
    roles: EDITORS,
    adminOnlyFrom: ['draft'],
  },
  unschedule: { from: ['scheduled'], to: 'draft', roles: EDITORS },
  pause: { from: ['scheduled'], to: 'paused', roles: EDITORS },
  resume: { from: ['paused'], to: 'scheduled', roles: EDITORS },
  cancel: { from: ['draft', 'approved', 'scheduled', 'paused', 'failed'], to: 'canceled', roles: EDITORS },
  restore: { from: ['canceled', 'rejected'], to: 'draft', roles: EDITORS },
  edit: {
    from: ['draft', 'rejected', 'canceled', 'failed', 'approved', 'in_review'],
    to: null,
    roles: EDITORS,
  },
  delete: { from: ['draft', 'rejected', 'canceled', 'failed'], to: null, roles: ADMINS },
}

export type ActionCheck =
  | { ok: true; to: PostStatus | null }
  | { ok: false; reason: 'status' | 'role' | 'admin_only'; message: string }

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'nacrt',
  in_review: 'na odobrenju',
  approved: 'odobreno',
  rejected: 'odbijeno',
  scheduled: 'zakazano',
  paused: 'pauzirano',
  publishing: 'objavljuje se',
  published: 'objavljeno',
  partially_published: 'delimično objavljeno',
  failed: 'neuspelo',
  canceled: 'otkazano',
}

export function statusLabel(status: PostStatus): string {
  return STATUS_LABEL[status]
}

export function checkAction(action: PostAction, from: PostStatus, role: WorkspaceRole): ActionCheck {
  const rule = ACTION_RULES[action]
  if (!rule.from.includes(from)) {
    return {
      ok: false,
      reason: 'status',
      message: `Radnja nije moguća dok je objava „${STATUS_LABEL[from]}”.`,
    }
  }
  if (!rule.roles.includes(role)) {
    return { ok: false, reason: 'role', message: 'Vaša uloga ne dozvoljava ovu radnju.' }
  }
  if (rule.adminOnlyFrom?.includes(from) && !ADMINS.includes(role)) {
    return {
      ok: false,
      reason: 'admin_only',
      message: 'Objava prvo ide na odobrenje; samo vlasnik ili administrator zakazuje bez odobravanja.',
    }
  }
  if (rule.to && !canTransition(from, rule.to)) {
    return { ok: false, reason: 'status', message: `Prelaz ${from} → ${rule.to} nije dozvoljen.` }
  }
  return { ok: true, to: rule.to }
}

/** Radnje koje korisnik trenutno može (za dugmad u UI-ju). */
export function availableActions(from: PostStatus, role: WorkspaceRole): PostAction[] {
  return (Object.keys(ACTION_RULES) as PostAction[]).filter((a) => checkAction(a, from, role).ok)
}

/** Status targeta koji prati status objave pri korisničkim radnjama. */
export function targetStatusFor(postStatus: PostStatus, current: TargetStatus): TargetStatus {
  switch (postStatus) {
    case 'scheduled':
      return current === 'needs_reauth' ? 'needs_reauth' : 'scheduled'
    case 'paused':
      return 'paused'
    case 'canceled':
      return 'canceled'
    case 'draft':
    case 'approved':
    case 'in_review':
    case 'rejected':
      return current === 'published' ? 'published' : 'pending'
    default:
      return current
  }
}

/** Vreme zakazivanja mora biti u budućnosti; `now` se prosleđuje radi testova. */
export function validateScheduleTime(
  scheduledFor: Date,
  now = new Date(),
): { ok: true } | { ok: false; message: string } {
  if (Number.isNaN(scheduledFor.getTime())) return { ok: false, message: 'Vreme nije ispravno.' }
  if (scheduledFor.getTime() < now.getTime() - 60_000) {
    return {
      ok: false,
      message: 'Vreme je u prošlosti. Izaberite budući termin ili upotrebite „Objavi sada”.',
    }
  }
  if (scheduledFor.getTime() > now.getTime() + 366 * 86_400_000) {
    return { ok: false, message: 'Zakazivanje je moguće najviše godinu dana unapred.' }
  }
  return { ok: true }
}
