import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET as brandsGet, POST as brandsPost } from '@/app/api/brands/route'
import { POST as acceptPost } from '@/app/api/invitations/[id]/accept/route'
import { POST as invitationsPost } from '@/app/api/invitations/route'
import { GET as meGet } from '@/app/api/me/route'
import { GET as membersGet, PATCH as membersPatch } from '@/app/api/workspaces/[id]/members/route'
import { GET as workspaceGet, PATCH as workspacePatch } from '@/app/api/workspaces/[id]/route'
import { GET as workspacesGet, POST as workspacesPost } from '@/app/api/workspaces/route'

import { call, createTestUser, deleteTestUser, type TestUser } from './helpers'

let a: TestUser
let b: TestUser
let wsA = ''
let brandA = ''

beforeAll(async () => {
  a = await createTestUser('a')
  b = await createTestUser('b')
})

afterAll(async () => {
  await deleteTestUser(a)
  await deleteTestUser(b)
})

describe('API: workspaces', () => {
  it('neulogovan → 401 UNAUTHENTICATED', async () => {
    const r = await call(workspacesGet, '/api/workspaces')
    expect(r.status).toBe(401)
    expect(r.json.error?.code).toBe('UNAUTHENTICATED')
  })

  it('neispravan ulaz → 400 sa poljima', async () => {
    const r = await call(workspacesPost, '/api/workspaces', {
      token: a.token,
      body: { name: '', type: 'nesto' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error?.code).toBe('VALIDATION')
    expect(Object.keys(r.json.error?.fields ?? {})).toEqual(expect.arrayContaining(['name', 'type']))
  })

  it('srećan put: kreiranje, listanje, čitanje', async () => {
    const created = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
      token: a.token,
      body: { name: 'Integracija A', type: 'business', websiteUrl: 'tangerineseo.rs' },
    })
    expect(created.status).toBe(200)
    wsA = created.json.data!.workspaceId
    brandA = created.json.data!.brandId

    const list = await call<Array<{ workspaceId: string; role: string }>>(workspacesGet, '/api/workspaces', {
      token: a.token,
    })
    expect(list.json.data?.some((w) => w.workspaceId === wsA && w.role === 'owner')).toBe(true)

    const one = await call<{ id: string; name: string }>(workspaceGet, `/api/workspaces/${wsA}`, {
      token: a.token,
      params: { id: wsA },
    })
    expect(one.status).toBe(200)
    expect(one.json.data?.name).toBe('Integracija A')

    const me = await call<{ memberships: unknown[] }>(meGet, '/api/me', { token: a.token })
    expect(me.json.data?.memberships.length).toBeGreaterThan(0)
  })

  it('tuđ workspace → 404 (ne otkriva se postojanje)', async () => {
    const r = await call(workspaceGet, `/api/workspaces/${wsA}`, { token: b.token, params: { id: wsA } })
    expect(r.status).toBe(404)
    const p = await call(workspacePatch, `/api/workspaces/${wsA}`, {
      method: 'PATCH',
      token: b.token,
      params: { id: wsA },
      body: { name: 'hak' },
    })
    expect(p.status).toBe(404)
  })

  it('mutacija sa pogrešnim Origin-om → 403', async () => {
    const r = await call(workspacePatch, `/api/workspaces/${wsA}`, {
      method: 'PATCH',
      token: a.token,
      params: { id: wsA },
      body: { name: 'X' },
      headers: { origin: 'https://zlonameran.example' },
    })
    expect(r.status).toBe(403)
  })
})

describe('API: brendovi i limiti plana', () => {
  it('lista brendova sadrži podrazumevani brend', async () => {
    const r = await call<Array<{ id: string; website_url: string | null }>>(brandsGet, '/api/brands', {
      token: a.token,
      query: { workspaceId: wsA },
    })
    expect(r.status).toBe(200)
    expect(r.json.data?.[0]?.id).toBe(brandA)
    expect(r.json.data?.[0]?.website_url).toBe('https://tangerineseo.rs')
  })

  it('besplatan plan dozvoljava 1 brend → drugi vraća 403 PLAN_LIMIT', async () => {
    const r = await call(brandsPost, '/api/brands', {
      token: a.token,
      body: { workspaceId: wsA, name: 'Drugi brend' },
    })
    expect(r.status).toBe(403)
    expect(r.json.error?.code).toBe('PLAN_LIMIT')
  })

  it('B ne može da napravi brend u A-ovom workspace-u', async () => {
    const r = await call(brandsPost, '/api/brands', {
      token: b.token,
      body: { workspaceId: wsA, name: 'Upad' },
    })
    expect([403, 404]).toContain(r.status)
  })
})

describe('API: tim i pozivnice', () => {
  it('besplatan plan: 1 član → pozivnica vraća PLAN_LIMIT; posle povećanja limita prolazi', async () => {
    const limited = await call(invitationsPost, '/api/invitations', {
      token: a.token,
      body: { workspaceId: wsA, email: b.email, role: 'editor' },
    })
    expect(limited.status).toBe(403)
    expect(limited.json.error?.code).toBe('PLAN_LIMIT')
  })

  it('pozivnica → prihvatanje → novi član vidi workspace; pogrešan email → 403', async () => {
    const { admin } = await import('./helpers')
    // Podigni limit članova besplatnog plana samo za ovaj test (vraća se na kraju).
    await admin
      .from('plans')
      .update({ limits: { brands: 1, social_accounts: 2, members: 3, crawl_pages: 30 } })
      .eq('code', 'free')
    try {
      const inv = await call<{ id: string; acceptUrl: string | null }>(invitationsPost, '/api/invitations', {
        token: a.token,
        body: { workspaceId: wsA, email: b.email, role: 'editor' },
      })
      expect(inv.status).toBe(200)
      expect(inv.json.data?.acceptUrl).toBeTruthy()
      const token = inv.json.data!.acceptUrl!.split('/invite/')[1]!

      const c = await createTestUser('c')
      try {
        const wrong = await call(acceptPost, `/api/invitations/${token}/accept`, {
          method: 'POST',
          token: c.token,
          params: { id: token },
        })
        expect(wrong.status).toBe(403)
      } finally {
        await deleteTestUser(c)
      }

      const ok = await call<{ workspaceId: string; role: string }>(
        acceptPost,
        `/api/invitations/${token}/accept`,
        {
          method: 'POST',
          token: b.token,
          params: { id: token },
        },
      )
      expect(ok.status).toBe(200)
      expect(ok.json.data).toEqual({ workspaceId: wsA, role: 'editor' })

      const seen = await call<{ name: string }>(workspaceGet, `/api/workspaces/${wsA}`, {
        token: b.token,
        params: { id: wsA },
      })
      expect(seen.status).toBe(200)

      const members = await call<{ members: Array<{ userId: string; role: string }> }>(
        membersGet,
        `/api/workspaces/${wsA}/members`,
        {
          token: b.token,
          params: { id: wsA },
        },
      )
      expect(members.json.data?.members.some((m) => m.userId === b.id && m.role === 'editor')).toBe(true)

      // editor ne može da menja uloge
      const forbidden = await call(membersPatch, `/api/workspaces/${wsA}/members`, {
        method: 'PATCH',
        token: b.token,
        params: { id: wsA },
        body: { userId: b.id, role: 'admin' },
      })
      expect(forbidden.status).toBe(403)

      // owner može
      const promoted = await call(membersPatch, `/api/workspaces/${wsA}/members`, {
        method: 'PATCH',
        token: a.token,
        params: { id: wsA },
        body: { userId: b.id, role: 'approver' },
      })
      expect(promoted.status).toBe(200)
    } finally {
      await admin
        .from('plans')
        .update({ limits: { brands: 1, social_accounts: 2, members: 1, crawl_pages: 30 } })
        .eq('code', 'free')
    }
  })
})
