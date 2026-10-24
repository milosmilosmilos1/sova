import type { ApiResponse } from '@/lib/api/response'

/**
 * Otpremanje iz pregledača (D-082): server daje potpisan URL, fajl ide PUT-om pravo u Supabase
 * skladište (XHR zbog trake napretka), pa server proverava i upisuje fajl. Next server ne prima bajtove,
 * jer Vercel funkcija ne prima telo veće od 4,5 MB.
 */
export interface UploadedMedia {
  id: string
  kind: 'image' | 'video'
  mimeType: string
  width: number | null
  height: number | null
  durationMs: number | null
  sizeBytes: number
  altText: string | null
  url: string
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
}

/** Pregledač ponekad ne zna tip (npr. .mov na Windows-u); tada se pogađa po ekstenziji. */
export function mimeOf(file: { name: string; type: string }): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

async function post<T>(path: string, json: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json),
  })
  const data = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!data) throw new Error('Server nije odgovorio.')
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

function storageMessage(xhr: XMLHttpRequest): string {
  let message = ''
  try {
    message = (JSON.parse(xhr.responseText) as { message?: string }).message ?? ''
  } catch {
    // telo nije JSON
  }
  if (xhr.status === 413 || /maximum allowed size|too large/i.test(message))
    return 'Fajl je veći nego što skladište prima.'
  if (/mime/i.test(message)) return 'Skladište ne prima ovaj tip fajla.'
  return message || `Skladište je vratilo grešku ${xhr.status}.`
}

function put(
  url: string,
  file: File,
  type: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('content-type', type)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(storageMessage(xhr)))
    xhr.onerror = () => reject(new Error('Otpremanje je prekinuto (nema veze sa skladištem).'))
    xhr.onabort = () => reject(new DOMException('Otpremanje je otkazano.', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

export async function uploadMediaFile(
  file: File,
  opts: { brandId: string; onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<UploadedMedia> {
  const mimeType = mimeOf(file)
  const target = await post<{ uploadId: string; signedUrl: string }>('/api/media/upload-url', {
    brandId: opts.brandId,
    mimeType,
    sizeBytes: file.size,
  })
  await put(target.signedUrl, file, mimeType, opts.onProgress, opts.signal)
  return post<UploadedMedia>('/api/media/complete', {
    brandId: opts.brandId,
    uploadId: target.uploadId,
    originalName: file.name,
  })
}

/** 75 500 ms → „1:16”. */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
