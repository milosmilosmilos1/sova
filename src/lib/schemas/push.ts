import { z } from 'zod'

/**
 * Pretplata pregledača (D-118). Server posle šalje na `endpoint`, pa su dozvoljeni samo servisi za
 * obaveštenja pregledača (Chrome i Edge preko Google-a, Firefox, Safari, stari Edge), ne bilo koja
 * adresa: tako pretplata ne može da natera server da šalje zahteve na unutrašnje adrese.
 */
const PUSH_HOST =
  /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/

export function isPushEndpoint(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.port && PUSH_HOST.test(u.hostname)
  } catch {
    return false
  }
}

const endpoint = z
  .url()
  .max(2048)
  .refine(isPushEndpoint, { error: 'Ovaj pregledač koristi nepoznat servis za obaveštenja.' })

export const pushSubscriptionSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
})

export const pushEndpointSchema = z.object({ endpoint: z.url().max(2048) })
