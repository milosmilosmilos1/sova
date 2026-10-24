/**
 * LinkedIn `little` format za polje `commentary` (Posts API). Rezervisani znakovi
 * `| { } @ [ ] ( ) < > # \ * _ ~` moraju biti escape-ovani obrnutom kosom crtom čak i kad nisu deo
 * elementa (little Text Format, pročitano 24.10.2026), inače API odbija objavu ili tekst menja smisao.
 * `#reč` ostaje hashtag (HashtagElement); `#` posle slova ili ispred razmaka je običan znak.
 */
const RESERVED = /[|{}@[\]()<>#\\*_~]/gu
const WORD_START = /^[\p{L}\p{N}]$/u
const BEFORE_HASHTAG = /^[\s\p{P}]$/u

export function toLittleText(text: string): string {
  return text.replace(RESERVED, (ch: string, offset: number, whole: string) => {
    if (ch === '#') {
      const next = whole.charAt(offset + 1)
      const prev = offset > 0 ? whole.charAt(offset - 1) : ''
      if (WORD_START.test(next) && (prev === '' || BEFORE_HASHTAG.test(prev))) return ch
    }
    return `\\${ch}`
  })
}
