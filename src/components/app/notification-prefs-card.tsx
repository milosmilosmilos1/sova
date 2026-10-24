'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { ApiResponse } from '@/lib/api/response'

interface Pref {
  type: string
  label: string
  description: string
  inApp: boolean
  email: boolean
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

/** Podešavanja obaveštenja po workspace-u: za svaki tip kanal u aplikaciji i email. */
export function NotificationPrefsCard({ workspaceId }: { workspaceId: string }) {
  const prefs = useQuery({
    queryKey: ['notification-prefs', workspaceId],
    queryFn: () => api<{ items: Pref[] }>(`/api/notifications/preferences?workspaceId=${workspaceId}`),
  })
  return (
    <Card id="obavestenja">
      <CardHeader>
        <CardTitle>Obaveštenja</CardTitle>
        <CardDescription>
          Šta stiže u aplikaciju, a šta i na email. Važi za ovaj radni prostor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {prefs.isPending ? (
          <p className="text-sm text-muted-foreground">Učitavam…</p>
        ) : prefs.isError ? (
          <p className="text-sm text-destructive">{prefs.error.message}</p>
        ) : (
          <PrefsForm
            key={JSON.stringify(prefs.data.items)}
            workspaceId={workspaceId}
            initial={prefs.data.items}
          />
        )}
      </CardContent>
    </Card>
  )
}

function PrefsForm({ workspaceId, initial }: { workspaceId: string; initial: Pref[] }) {
  const [items, setItems] = useState(initial)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      api<{ items: Pref[] }>('/api/notifications/preferences', {
        method: 'PUT',
        json: { workspaceId, items: items.map((i) => ({ type: i.type, inApp: i.inApp, email: i.email })) },
      }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })
  const toggle = (type: string, key: 'inApp' | 'email', value: boolean) =>
    setItems((list) => list.map((i) => (i.type === type ? { ...i, [key]: value } : i)))
  const dirty = JSON.stringify(items) !== JSON.stringify(initial)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-xs text-muted-foreground">Tip</span>
        <span className="text-xs text-muted-foreground">U aplikaciji</span>
        <span className="text-xs text-muted-foreground">Email</span>
        {items.map((i) => (
          <PrefRow key={i.type} pref={i} onToggle={toggle} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          Sačuvaj
        </Button>
        {saved ? <span className="text-xs text-muted-foreground">Sačuvano.</span> : null}
        {save.isError ? <span className="text-xs text-destructive">{save.error.message}</span> : null}
      </div>
    </div>
  )
}

function PrefRow({
  pref,
  onToggle,
}: {
  pref: Pref
  onToggle: (type: string, key: 'inApp' | 'email', value: boolean) => void
}) {
  return (
    <>
      <div>
        <div>{pref.label}</div>
        <div className="text-xs text-muted-foreground">{pref.description}</div>
      </div>
      <Switch
        checked={pref.inApp}
        onCheckedChange={(v) => onToggle(pref.type, 'inApp', Boolean(v))}
        aria-label={`${pref.label} u aplikaciji`}
      />
      <Switch
        checked={pref.email}
        onCheckedChange={(v) => onToggle(pref.type, 'email', Boolean(v))}
        aria-label={`${pref.label} na email`}
      />
    </>
  )
}
