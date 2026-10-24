#!/usr/bin/env node
/**
 * TOTP kod (RFC 6238: SHA-1, 30 s, 6 cifara) za lokalnog demo admina, kad aplikacija za kodove
 * nije pri ruci. Pokretanje: npm run demo:totp -- <tajna koju ispiše demo:seed>
 */
import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const h = createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.argv[2]
  if (!secret) {
    console.error('Upotreba: npm run demo:totp -- <TOTP tajna>')
    process.exit(1)
  }
  const left = 30 - (Math.floor(Date.now() / 1000) % 30)
  console.log(`${totp(secret)}  (važi još ${left} s)`)
}
