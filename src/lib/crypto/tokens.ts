import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Šifrovanje OAuth tokena (brif 4): AES-256-GCM, ključ iz `TOKEN_ENCRYPTION_KEY` u formatu
 * `v<verzija>:<base64 32 bajta>`. Verzija se čuva uz zapis (`key_version`) radi rotacije:
 * nov ključ ide u `TOKEN_ENCRYPTION_KEY`, stari u `TOKEN_ENCRYPTION_KEY_PREVIOUS`, pa se redovi
 * ponovo šifruju i stari ključ uklanja (RUNBOOK 4).
 *
 * Format šifrata: iv(12) | tag(16) | ciphertext.
 */
interface KeyEntry {
  version: number
  key: Buffer
}

function parseKey(raw: string | undefined, label: string): KeyEntry | null {
  if (!raw) return null
  const m = /^v(\d+):([A-Za-z0-9+/=]+)$/.exec(raw.trim())
  if (!m) throw new Error(`${label} mora biti u formatu v1:<base64 ključ od 32 bajta>.`)
  const key = Buffer.from(m[2]!, 'base64')
  if (key.length !== 32) throw new Error(`${label}: ključ mora imati 32 bajta (openssl rand -base64 32).`)
  return { version: Number(m[1]), key }
}

let cache: { current: KeyEntry; all: Map<number, KeyEntry> } | null = null

function keys(): { current: KeyEntry; all: Map<number, KeyEntry> } {
  if (cache) return cache
  const current = parseKey(env.TOKEN_ENCRYPTION_KEY, 'TOKEN_ENCRYPTION_KEY')
  if (!current) throw new Error('TOKEN_ENCRYPTION_KEY nije podešen.')
  const previous = parseKey(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS, 'TOKEN_ENCRYPTION_KEY_PREVIOUS')
  const all = new Map<number, KeyEntry>([[current.version, current]])
  if (previous) all.set(previous.version, previous)
  cache = { current, all }
  return cache
}

/** Za testove posle promene env-a. */
export function resetTokenKeysForTests(): void {
  cache = null
}

export interface Encrypted {
  ciphertext: Buffer
  keyVersion: number
}

export function encryptSecret(plain: string, aad?: string): Encrypted {
  const { current } = keys()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', current.key, iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([iv, tag, body]), keyVersion: current.version }
}

export function decryptSecret(
  ciphertext: Buffer | Uint8Array | string,
  keyVersion: number,
  aad?: string,
): string {
  const buf = typeof ciphertext === 'string' ? fromPgBytea(ciphertext) : Buffer.from(ciphertext)
  const entry = keys().all.get(keyVersion)
  if (!entry)
    throw new Error(`Ključ verzije ${keyVersion} nije dostupan; podesi TOKEN_ENCRYPTION_KEY_PREVIOUS.`)
  if (buf.length < 29) throw new Error('Šifrat je prekratak.')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const body = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', entry.key, iv)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

/** Supabase vraća bytea kao hex string `\x...`; pri upisu šaljemo isti format. */
export function toPgBytea(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`
}

export function fromPgBytea(value: string): Buffer {
  if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
  return Buffer.from(value, 'base64')
}

/** Hash za state/token vrednosti koje se čuvaju u bazi (ne čuvamo original). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function currentKeyVersion(): number {
  return keys().current.version
}
