'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, MessageCircleReply, Pencil, Plus, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { cn } from '@/lib/utils'

/**
 * DM automatizacija (D-117): tok „ključna reč u komentaru → javni odgovor → privatna poruka sa
 * linkom → podsetnik”, kontakti koji su prošli kroz tokove i ukupan rezultat (pogoci, poruke,
 * klikovi). Tok može da se pripremi odmah; uključuje se kad Meta odobri dozvole za poruke.
 */
interface Automation {
  id: string
  name: string
  accountId: string
  accountName: string | null
  platform: SocialPlatform
  keywords: string[]
  publicReplies: string[]
  dmMessage: string
  linkUrl: string | null
  linkLabel: string | null
  followUp: string | null
  followUpHours: number
  active: boolean
  lastError: string | null
  stats: { matches: number; dms: number; clicks: number }
  createdAt: string
}

interface Data {
  enabled: boolean
  automations: Automation[]
  contacts: Array<{
    id: string
    automationName: string
    username: string | null
    stage: 'matched' | 'dm_sent' | 'clicked' | 'followed_up' | 'failed'
    commentText: string | null
    createdAt: string
  }>
  totals: { matches: number; dms: number; clicks: number; active: number; paused: number; problems: number }
  accounts: Array<{ id: string; platform: SocialPlatform; name: string; canMessage: boolean }>
}

interface Draft {
  id: string | null
  accountId: string
  name: string
  keywords: string[]
  keywordInput: string
  publicReplies: string[]
  dmMessage: string
  linkUrl: string
  linkLabel: string
  followUp: string
  followUpHours: number
  active: boolean
}

const INTL: Record<string, string> = { 'sr-Latn': 'sr-Latn-RS', en: 'en-GB', uk: 'uk-UA' }

function emptyDraft(accountId: string): Draft {
  return {
    id: null,
    accountId,
    name: '',
    keywords: [],
    keywordInput: '',
    publicReplies: [''],
    dmMessage: '',
    linkUrl: '',
    linkLabel: '',
    followUp: '',
    followUpHours: 4,
    active: false,
  }
}

export function DmAutomations({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('automations')
  const locale = useLocale()
  const qc = useQueryClient()
  const key = ['automations', brandId]
  const query = useQuery({ queryKey: key, queryFn: () => api<Data>(`/api/automations?brandId=${brandId}`) })
  const [draft, setDraft] = useState<Draft | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: key })
  const toggle = useMutation({
    mutationFn: (a: { id: string; active: boolean }) =>
      api(`/api/automations/${a.id}`, { method: 'PATCH', json: { active: a.active } }),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/automations/${id}`, { method: 'DELETE' }),
    onSettled: refresh,
  })
  const data = query.data
  const when = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const firstAccount = data?.accounts[0]?.id ?? ''
  const max = Math.max(1, data?.totals.matches ?? 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canEdit ? (
          <Button disabled={!data?.accounts.length} onClick={() => setDraft(emptyDraft(firstAccount))}>
            <Plus aria-hidden />
            {t('new')}
          </Button>
        ) : null}
      </div>

      {data && !data.enabled ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">{t('waiting.title')}</p>
          <p className="mt-1">{t('waiting.text')}</p>
        </div>
      ) : null}
      <ErrorBox error={query.error ?? toggle.error ?? remove.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-xl bg-linear-to-br from-primary to-primary/80 p-5 text-primary-foreground">
          <p className="text-xs font-semibold tracking-wider uppercase opacity-80">{t('hero.eyebrow')}</p>
          <h2 className="mt-1 text-xl font-semibold">{t('hero.title')}</h2>
          <p className="mt-1 max-w-xl text-sm opacity-90">{t('hero.text')}</p>
          <ol className="mt-4 flex flex-wrap gap-2 text-xs">
            {(['keyword', 'message', 'link'] as const).map((s, i) => (
              <li key={s} className="rounded-full bg-white/15 px-3 py-1">
                {i + 1}. {t(`hero.steps.${s}`)}
              </li>
            ))}
          </ol>
          {canEdit && data?.accounts.length ? (
            <Button variant="secondary" className="mt-4" onClick={() => setDraft(emptyDraft(firstAccount))}>
              {data.automations.length ? t('new') : t('hero.cta')}
            </Button>
          ) : null}
          {data && !data.accounts.length ? (
            <p className="mt-4 text-sm">
              {t('noAccounts')}{' '}
              <Link href="/app/accounts" className="underline">
                {t('connect')}
              </Link>
            </p>
          ) : null}
        </section>
        <section aria-label={t('status.title')} className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {t('status.title')}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{data?.automations.length ?? 0}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {(['active', 'paused', 'problems'] as const).map((k) => (
              <div key={k} className="rounded-lg bg-muted px-2 py-2">
                <dt className="text-muted-foreground">{t(`status.${k}`)}</dt>
                <dd className="text-base font-semibold tabular-nums">{data?.totals[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="font-semibold">{t('list.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('list.hint')}</p>
          </div>
        </header>
        {data && !data.automations.length ? (
          <div className="mx-auto max-w-md space-y-2 px-5 py-10 text-center text-sm text-muted-foreground">
            <MessageCircleReply className="mx-auto size-6" aria-hidden />
            <p className="font-medium text-foreground">{t('list.emptyTitle')}</p>
            <p>{t('list.emptyText')}</p>
          </div>
        ) : null}
        <ul className="divide-y">
          {(data?.automations ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {a.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {PLATFORMS[a.platform]?.label} · {a.accountName}
                  </span>
                </p>
                <p className="flex flex-wrap gap-1">
                  {a.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {k}
                    </span>
                  ))}
                </p>
                {a.lastError ? (
                  <p className="text-xs text-destructive">{t('list.error', { error: a.lastError })}</p>
                ) : null}
              </div>
              <dl className="flex gap-4 text-center text-xs">
                {(['matches', 'dms', 'clicks'] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{t(`totals.${k}`)}</dt>
                    <dd className="font-semibold tabular-nums">{a.stats[k]}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center gap-2">
                <Switch
                  checked={a.active}
                  disabled={!canEdit || !data?.enabled || toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ id: a.id, active: Boolean(v) })}
                  aria-label={t('list.toggle', { name: a.name })}
                />
                {canEdit ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('list.edit', { name: a.name })}
                      onClick={() =>
                        setDraft({
                          id: a.id,
                          accountId: a.accountId,
                          name: a.name,
                          keywords: a.keywords,
                          keywordInput: '',
                          publicReplies: a.publicReplies.length ? a.publicReplies : [''],
                          dmMessage: a.dmMessage,
                          linkUrl: a.linkUrl ?? '',
                          linkLabel: a.linkLabel ?? '',
                          followUp: a.followUp ?? '',
                          followUpHours: a.followUpHours,
                          active: a.active,
                        })
                      }
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={t('list.delete', { name: a.name })}
                      onClick={() => window.confirm(t('list.confirmDelete')) && remove.mutate(a.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-x-auto rounded-xl border bg-card">
          <header className="border-b px-5 py-3">
            <h2 className="font-semibold">{t('contacts.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('contacts.hint')}</p>
          </header>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">{t('contacts.account')}</th>
                <th className="px-3 py-2 font-medium">{t('contacts.flow')}</th>
                <th className="px-3 py-2 font-medium">{t('contacts.stage')}</th>
                <th className="px-3 py-2 font-medium">{t('contacts.when')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data?.contacts ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-2">{c.username ? `@${c.username}` : t('contacts.unknown')}</td>
                  <td className="px-3 py-2">{c.automationName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        c.stage === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                      )}
                    >
                      {t(`stages.${c.stage}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {when.format(new Date(c.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.contacts.length ? (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t('contacts.empty')}</p>
          ) : null}
        </section>
        <section aria-label={t('totals.title')} className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t('totals.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('totals.hint')}</p>
          {(['matches', 'dms', 'clicks'] as const).map((k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{t(`totals.${k}`)}</span>
                <span className="font-semibold tabular-nums">{data?.totals[k] ?? 0}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.round(((data?.totals[k] ?? 0) / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>

      {draft && data ? (
        <AutomationEditor
          draft={draft}
          setDraft={setDraft}
          accounts={data.accounts}
          enabled={data.enabled}
          brandId={brandId}
          onSaved={() => {
            setDraft(null)
            refresh()
          }}
          t={t}
        />
      ) : null}
    </div>
  )
}

function AutomationEditor({
  draft,
  setDraft,
  accounts,
  enabled,
  brandId,
  onSaved,
  t,
}: {
  draft: Draft
  setDraft: (d: Draft | null) => void
  accounts: Data['accounts']
  enabled: boolean
  brandId: string
  onSaved: () => void
  t: ReturnType<typeof useTranslations<'automations'>>
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const account = accounts.find((a) => a.id === draft.accountId)
  const addKeyword = () => {
    const parts = draft.keywordInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (!parts.length) return
    set({ keywords: [...new Set([...draft.keywords, ...parts])].slice(0, 10), keywordInput: '' })
  }
  const save = useMutation({
    mutationFn: () => {
      const pending = draft.keywordInput.trim()
        ? [...draft.keywords, ...draft.keywordInput.split(',')]
        : draft.keywords
      const body = {
        name: draft.name,
        keywords: [...new Set(pending.map((k) => k.trim()).filter(Boolean))].slice(0, 10),
        publicReplies: draft.publicReplies.map((r) => r.trim()).filter(Boolean),
        dmMessage: draft.dmMessage,
        linkUrl: draft.linkUrl.trim() || null,
        linkLabel: draft.linkLabel.trim() || null,
        followUp: draft.followUp.trim() || null,
        followUpHours: draft.followUpHours,
        active: draft.active,
      }
      return draft.id
        ? api(`/api/automations/${draft.id}`, { method: 'PATCH', json: body })
        : api('/api/automations', { method: 'POST', json: { ...body, brandId, accountId: draft.accountId } })
    },
    onSuccess: onSaved,
  })
  return (
    <Dialog open onOpenChange={(open) => (open ? null : setDraft(null))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? t('editor.editTitle') : t('editor.newTitle')}</DialogTitle>
          <DialogDescription>{t('editor.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dm-account">{t('editor.account')}</Label>
              <select
                id="dm-account"
                value={draft.accountId}
                disabled={Boolean(draft.id)}
                onChange={(e) => set({ accountId: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {PLATFORMS[a.platform]?.label} · {a.name}
                  </option>
                ))}
              </select>
              {account && !account.canMessage ? (
                <p className="text-xs text-muted-foreground">{t('editor.noMessaging')}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dm-name">{t('editor.name')}</Label>
              <Input
                id="dm-name"
                value={draft.name}
                maxLength={80}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={t('editor.namePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dm-keywords">{t('editor.keywords')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {draft.keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => set({ keywords: draft.keywords.filter((x) => x !== k) })}
                    aria-label={t('editor.removeKeyword', { keyword: k })}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <Input
              id="dm-keywords"
              value={draft.keywordInput}
              onChange={(e) => set({ keywordInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              onBlur={addKeyword}
              placeholder={t('editor.keywordsPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('editor.keywordsHint')}</p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t('editor.publicReplies')}</legend>
            {draft.publicReplies.map((r, i) => (
              <Input
                key={i}
                value={r}
                maxLength={300}
                aria-label={t('editor.publicReply', { n: i + 1 })}
                onChange={(e) =>
                  set({ publicReplies: draft.publicReplies.map((x, j) => (j === i ? e.target.value : x)) })
                }
                placeholder={t('editor.publicReplyPlaceholder')}
              />
            ))}
            {draft.publicReplies.length < 3 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set({ publicReplies: [...draft.publicReplies, ''] })}
              >
                <Plus aria-hidden />
                {t('editor.addVariant')}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('editor.publicRepliesHint')}</p>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="dm-message">{t('editor.message')}</Label>
            <Textarea
              id="dm-message"
              rows={4}
              maxLength={1000}
              value={draft.dmMessage}
              onChange={(e) => set({ dmMessage: e.target.value })}
              placeholder={t('editor.messagePlaceholder')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dm-link">
                <Link2 className="mr-1 inline size-3.5" aria-hidden />
                {t('editor.link')}
              </Label>
              <Input
                id="dm-link"
                type="url"
                value={draft.linkUrl}
                onChange={(e) => set({ linkUrl: e.target.value })}
                placeholder="https://"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dm-link-label">{t('editor.linkLabel')}</Label>
              <Input
                id="dm-link-label"
                value={draft.linkLabel}
                maxLength={60}
                onChange={(e) => set({ linkLabel: e.target.value })}
                placeholder={t('editor.linkLabelPlaceholder')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('editor.linkHint')}</p>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="dm-follow">{t('editor.followUp')}</Label>
              <Textarea
                id="dm-follow"
                rows={2}
                maxLength={1000}
                value={draft.followUp}
                onChange={(e) => set({ followUp: e.target.value })}
                placeholder={t('editor.followUpPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dm-hours">{t('editor.followUpHours')}</Label>
              <select
                id="dm-hours"
                value={draft.followUpHours}
                onChange={(e) => set({ followUpHours: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {[1, 2, 4, 8, 12, 20].map((h) => (
                  <option key={h} value={h}>
                    {t('editor.hours', { n: h })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('editor.followUpHint')}</p>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">{t('editor.active')}</span>
              <span className="block text-xs text-muted-foreground">
                {enabled ? t('editor.activeHint') : t('editor.activeWaiting')}
              </span>
            </span>
            <Switch
              checked={draft.active}
              disabled={!enabled}
              onCheckedChange={(v) => set({ active: Boolean(v) })}
              aria-label={t('editor.active')}
            />
          </label>

          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              {t('editor.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || !draft.name.trim() || !draft.dmMessage.trim()}>
              {save.isPending ? t('editor.saving') : t('editor.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
