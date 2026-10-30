'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Copy, Download, Smartphone, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'

/**
 * „Odobravajte sa telefona” (D-118): instalacija Sove na početni ekran (dugme gde pregledač to
 * dozvoljava, uputstvo za iPhone i Android) i obaveštenja na ovom uređaju za nacrte koji čekaju
 * odluku. Kartica se sklanja i pamti to u pregledaču.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const HIDDEN_KEY = 'sova_install_card_hidden'

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function InstallCard() {
  const t = useTranslations('install')
  const qc = useQueryClient()
  const [hidden, setHidden] = useState(true)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [copied, setCopied] = useState(false)

  const status = useQuery({
    queryKey: ['push-status'],
    queryFn: () => api<{ publicKey: string | null; devices: number }>('/api/push'),
  })

  // stanje pregledača se čita tek posle prvog crtanja (na serveru ga nema)
  useEffect(() => {
    let hide = false
    try {
      hide = window.localStorage.getItem(HIDDEN_KEY) === '1'
    } catch {
      hide = false
    }
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    queueMicrotask(() => {
      setHidden(hide)
      setStandalone(isStandalone)
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
      setPushSupported(supported)
    })
    if (supported)
      void navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscription(sub))
        .catch(() => undefined)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const subscribe = useMutation({
    mutationFn: async () => {
      const key = status.data?.publicKey
      if (!key) throw new Error(t('push.notConfigured'))
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error(t('push.denied'))
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(key),
      })
      await api('/api/push/subscribe', { method: 'POST', json: sub.toJSON() })
      setSubscription(sub)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['push-status'] }),
  })
  const unsubscribe = useMutation({
    mutationFn: async () => {
      if (!subscription) return
      await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: subscription.endpoint } })
      await subscription.unsubscribe()
      setSubscription(null)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['push-status'] }),
  })
  const test = useMutation({
    mutationFn: () => api<{ sent: number }>('/api/push/test', { method: 'POST', json: {} }),
  })

  if (hidden) return null
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/app/approvals`
  const canPush = pushSupported && Boolean(status.data?.publicKey)

  return (
    <section aria-label={t('title')} className="relative rounded-xl border bg-card p-5">
      <button
        type="button"
        onClick={() => {
          setHidden(true)
          try {
            window.localStorage.setItem(HIDDEN_KEY, '1')
          } catch {
            // bez pristupa skladištu kartica se samo sklanja do sledećeg otvaranja
          }
        }}
        aria-label={t('hide')}
        className="absolute top-3 right-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{standalone ? t('installed') : t('text')}</p>
        </div>
      </div>

      {!standalone ? (
        <ol className="mt-4 space-y-1.5 pl-1 text-sm">
          <li>1. {t('steps.open')}</li>
          <li>2. {ios ? t('steps.ios') : t('steps.android')}</li>
          <li>3. {t('steps.notify')}</li>
        </ol>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {installEvent && !standalone ? (
          <Button
            onClick={() => {
              void installEvent.prompt()
              void installEvent.userChoice.finally(() => setInstallEvent(null))
            }}
          >
            <Download aria-hidden />
            {t('install')}
          </Button>
        ) : null}
        {!standalone ? (
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(link).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
            }
          >
            <Copy aria-hidden />
            {copied ? t('copied') : t('copy')}
          </Button>
        ) : null}
        {canPush ? (
          subscription ? (
            <>
              <Button variant="outline" disabled={unsubscribe.isPending} onClick={() => unsubscribe.mutate()}>
                <BellOff aria-hidden />
                {t('push.off')}
              </Button>
              <Button variant="ghost" disabled={test.isPending} onClick={() => test.mutate()}>
                {t('push.test')}
              </Button>
            </>
          ) : (
            <Button
              variant={standalone ? 'default' : 'outline'}
              disabled={subscribe.isPending}
              onClick={() => subscribe.mutate()}
            >
              <Bell aria-hidden />
              {t('push.on')}
            </Button>
          )
        ) : null}
      </div>
      {pushSupported && status.data && !status.data.publicKey ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('push.notConfigured')}</p>
      ) : null}
      {test.data ? (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {test.data.sent ? t('push.sent', { count: test.data.sent }) : t('push.sentNone')}
        </p>
      ) : null}
      <div className="mt-3">
        <ErrorBox error={subscribe.error ?? unsubscribe.error ?? test.error} />
      </div>
    </section>
  )
}
