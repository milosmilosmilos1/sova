'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import Link from 'next/link'

import { NotificationRow, fetchNotifications, markRead } from '@/components/app/notifications-list'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Zvono u navigaciji: broj nepročitanih (osvežava se na minut) i poslednjih 8 obaveštenja. */
export function NotificationsBell({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient()
  const page = useQuery({
    queryKey: ['notifications', workspaceId, 8],
    queryFn: () => fetchNotifications(workspaceId, 8),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const read = useMutation({
    mutationFn: markRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const unread = page.data?.unreadCount ?? 0
  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-sidebar-accent"
        aria-label={unread ? `Obaveštenja, ${unread} nepročitanih` : 'Obaveštenja'}
      >
        <Bell className="size-4" aria-hidden />
        {unread ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Obaveštenja</p>
          {unread ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => read.mutate({ all: true, workspaceId })}
              disabled={read.isPending}
            >
              Pročitano
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {page.isPending ? (
            <p className="p-3 text-xs text-muted-foreground">Učitavam…</p>
          ) : page.isError ? (
            <p className="p-3 text-xs text-destructive">{page.error.message}</p>
          ) : page.data.items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Još nema obaveštenja.</p>
          ) : (
            <ul className="divide-y">
              {page.data.items.map((n) => (
                <li key={n.id} className={n.readAt ? 'opacity-70' : ''}>
                  <NotificationRow
                    n={n}
                    compact
                    onOpen={() => (n.readAt ? undefined : read.mutate({ ids: [n.id] }))}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-2 text-right">
          <Link href="/app/notifications" className="text-xs underline">
            Sva obaveštenja
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
