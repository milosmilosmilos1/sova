/**
 * Mali markdown za članke bloga (D-186). Podržava samo ono što članci koriste: front matter,
 * naslove H2 i H3, pasuse, liste, tabele, okvir `:::ukratko`, citat i sliku `!slika:<ključ>`; u
 * redu podebljano i link. Bez zavisnosti i bez aliasa, jer ga koristi i `scripts/blog-build.mjs`.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'h2'; id: string; text: string; children: Inline[] }
  | { type: 'h3'; id: string; text: string; children: Inline[] }
  | { type: 'p'; children: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { type: 'summary'; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'image'; key: string }

export interface ParsedDoc {
  meta: Record<string, string>
  blocks: Block[]
}

/** Front matter `ključ: vrednost` između dve linije `---`. */
export function splitFrontMatter(source: string): { meta: Record<string, string>; body: string } {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: text.slice(match[0].length) }
}

const FOLD: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' }

/** Sidro naslova: mala slova, bez kvačica, crtica umesto razmaka. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[čćšžđ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1]) })
    else out.push({ type: 'link', href: m[3]!, children: parseInline(m[2]!) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/** Čist tekst iz reda (za brojanje reči, sidra i JSON-LD). */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : plainText(n.children))).join('')
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()))

export function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  const used = new Map<string, number>()
  const anchor = (text: string) => {
    const base = slugify(text) || 'odeljak'
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    return n ? `${base}-${n + 1}` : base
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trimEnd()
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('### ') || line.startsWith('## ')) {
      const level = line.startsWith('### ') ? 'h3' : 'h2'
      const text = line.slice(level === 'h3' ? 4 : 3).trim()
      const children = parseInline(text)
      blocks.push({ type: level, id: anchor(plainText(children)), text: plainText(children), children })
      i++
      continue
    }
    const image = /^!slika:([a-z0-9-]+)$/.exec(line.trim())
    if (image) {
      blocks.push({ type: 'image', key: image[1]! })
      i++
      continue
    }
    if (line.trim() === ':::ukratko') {
      const items: Inline[][] = []
      i++
      while (i < lines.length && lines[i]!.trim() !== ':::') {
        const item = lines[i]!.trim()
        if (item.startsWith('- ')) items.push(parseInline(item.slice(2).trim()))
        i++
      }
      i++
      blocks.push({ type: 'summary', items })
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!)
      const [head = '', , ...rest] = rows
      blocks.push({ type: 'table', head: cells(head), rows: rest.map(cells) })
      continue
    }
    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line)
      const items: Inline[][] = []
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]!) : /^- /.test(lines[i]!))) {
        items.push(parseInline(lines[i]!.replace(/^(- |\d+\. )/, '').trim()))
        i++
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    if (line.startsWith('> ')) {
      const parts: string[] = []
      while (i < lines.length && lines[i]!.startsWith('> ')) parts.push(lines[i++]!.slice(2).trim())
      blocks.push({ type: 'quote', children: parseInline(parts.join(' ')) })
      continue
    }
    const parts: string[] = []
    while (i < lines.length) {
      const l = lines[i]!.trim()
      if (!l || /^(#{2,3} |!slika:|:::|\||- |\d+\. |> )/.test(l)) break
      parts.push(l)
      i++
    }
    blocks.push({ type: 'p', children: parseInline(parts.join(' ')) })
  }
  return blocks
}

export function parseDoc(source: string): ParsedDoc {
  const { meta, body } = splitFrontMatter(source)
  return { meta, blocks: parseBlocks(body) }
}

/** Svi redovi teksta u bloku, za brojanje reči, linkova i podebljanih delova. */
export function blockInlines(block: Block): Inline[][] {
  switch (block.type) {
    case 'h2':
    case 'h3':
    case 'p':
    case 'quote':
      return [block.children]
    case 'ul':
    case 'ol':
    case 'summary':
      return block.items
    case 'table':
      return [...block.head, ...block.rows.flat()]
    case 'image':
      return []
  }
}

/** Pitanja i odgovori iz odeljka „Česta pitanja” (H3 je pitanje, pasusi do sledećeg H3 su odgovor). */
export function faqFrom(blocks: Block[], heading: string): Array<{ q: string; a: string }> {
  const start = blocks.findIndex((b) => b.type === 'h2' && b.text === heading)
  if (start < 0) return []
  const out: Array<{ q: string; a: string }> = []
  for (const b of blocks.slice(start + 1)) {
    if (b.type === 'h2') break
    if (b.type === 'h3') out.push({ q: b.text, a: '' })
    else if (out.length) {
      const text = blockInlines(b).map(plainText).join(' ')
      const last = out[out.length - 1]!
      last.a = last.a ? `${last.a} ${text}` : text
    }
  }
  return out.filter((x) => x.a)
}

export function wordCount(blocks: Block[]): number {
  return blocks
    .flatMap(blockInlines)
    .map(plainText)
    .join(' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}
