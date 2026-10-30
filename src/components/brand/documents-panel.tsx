'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { uploadBrandDocument } from '@/lib/media/client-upload'
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS } from '@/lib/schemas/setup'
import { cn } from '@/lib/utils'

export interface BrandDocument {
  id: string
  kind: 'pdf' | 'note'
  name: string
  excerpt: string | null
  sizeBytes: number
  pages: number | null
  chars: number
  chunks: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  createdAt: string
}

/**
 * Dokumenti o brendu (D-112): PDF ide pravo u skladište, server ga čita u pozadini; lista se osvežava
 * dok ima dokumenata koji se čitaju.
 */
export function DocumentsPanel({
  brandId,
  canEdit,
  emailVerified,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('documents')
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const key = ['brand-documents', brandId]

  const docs = useQuery({
    queryKey: key,
    queryFn: () => api<BrandDocument[]>(`/api/brands/${brandId}/documents`),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'processing') ? 2500 : false),
  })
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadBrandDocument<BrandDocument>(file, { brandId, onProgress: (f) => setProgress(f) }),
    onSettled: () => {
      setProgress(null)
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['brand-voice', brandId] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/brands/${brandId}/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['brand-voice', brandId] })
    },
  })

  // beleške su na strani Brain; ovde su samo PDF-ovi
  const list = (docs.data ?? []).filter((d) => d.kind === 'pdf')
  const full = list.length >= MAX_DOCUMENTS
  const disabled = !canEdit || !emailVerified || upload.isPending || full

  const pick = (file: File | undefined) => {
    setLocalError(null)
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) return setLocalError(t('notPdf'))
    if (file.size > MAX_DOCUMENT_BYTES) return setLocalError(t('tooLarge'))
    upload.mutate(file)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) pick(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center text-sm',
          dragging ? 'border-primary bg-primary/5' : 'bg-muted/30',
          disabled && 'opacity-70',
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            {t('choose')}
          </Button>
          <span className="text-muted-foreground">{t('drop')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('limits', { max: MAX_DOCUMENTS })}</p>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {progress !== null ? (
          <p role="status" className="text-xs text-muted-foreground">
            {t('uploading', { percent: Math.round(progress * 100) })}
          </p>
        ) : null}
      </div>
      {!emailVerified ? <p className="text-sm text-muted-foreground">{t('verifyEmail')}</p> : null}
      {localError ? (
        <p role="alert" className="text-sm text-destructive">
          {localError}
        </p>
      ) : null}
      <ErrorBox error={upload.error ?? remove.error ?? docs.error} />

      {list.length ? (
        <ul className="divide-y rounded-lg border">
          {list.map((d) => (
            <li key={d.id} className="flex items-start gap-3 p-3 text-sm">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p
                  className={cn(
                    'text-xs',
                    d.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                  role={d.status === 'processing' ? 'status' : undefined}
                >
                  {d.status === 'ready'
                    ? t('status.ready', { pages: d.pages ?? 0 })
                    : d.status === 'failed'
                      ? `${t('status.failed')}${d.error ? `: ${d.error}` : ''}`
                      : t('status.processing')}
                </p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  aria-label={`${t('delete')}: ${d.name}`}
                  onClick={() => {
                    if (window.confirm(t('confirmDelete', { name: d.name }))) remove.mutate(d.id)
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : docs.isSuccess ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : null}
    </div>
  )
}
