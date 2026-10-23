/** Mailpit API lokalnog Supabase-a: čitanje linkova iz auth emailova. */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

interface MailpitSummary {
  ID: string
  To: Array<{ Address: string }>
  Subject: string
  Created: string
}

interface MailpitMessage {
  ID: string
  Subject: string
  HTML: string
  Text: string
}

export async function waitForEmail(
  to: string,
  subjectPart: string,
  timeoutMs = 20_000,
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=20`)
    if (res.ok) {
      const data = (await res.json()) as { messages: MailpitSummary[] }
      const hit = data.messages.find(
        (m) =>
          m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()) &&
          m.Subject.toLowerCase().includes(subjectPart.toLowerCase()),
      )
      if (hit) {
        const full = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
        return (await full.json()) as MailpitMessage
      }
    }
    await new Promise((r) => setTimeout(r, 750))
  }
  throw new Error(`Email za ${to} sa naslovom "${subjectPart}" nije stigao za ${timeoutMs} ms`)
}

export function extractLink(message: MailpitMessage, pathPart: string): string {
  const source = `${message.HTML}\n${message.Text}`
  const links = [...source.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0].replace(/&amp;/g, '&'))
  const link = links.find((l) => l.includes(pathPart))
  if (!link) throw new Error(`Link sa "${pathPart}" nije nađen u emailu "${message.Subject}"`)
  return link
}
