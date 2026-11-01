import { Fa, GoogleG } from '@/components/landing/icons'
import { byKey } from '@/components/landing/platforms'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { cn } from '@/lib/utils'

/**
 * Mreža u svojim bojama, svuda gde se pominje u aplikaciji: pločica sa znakom mreže (boje i znaci
 * iz `landing/platforms.ts`, isti kao na sajtu) i naziv. Tekst ostaje u boji teksta, a boja mreže
 * je na pločici i u okviru čipa, da natpis ne zavisi samo od boje. Nazivi mreža su vlastita imena,
 * isti na svim jezicima.
 */
const isSocial = (p: string): p is SocialPlatform => p in PLATFORMS

export function NetworkIcon({
  platform,
  size = 16,
  round = false,
  className,
}: {
  platform: SocialPlatform
  size?: number
  /** okrugla pločica (u čipu) */
  round?: boolean
  className?: string
}) {
  const p = byKey(platform)
  const glyph = Math.max(8, Math.round(size * 0.58))
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white',
        p.tile === 'ig' && 'l-ig',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: round ? 9999 : Math.max(3, Math.round(size * 0.28)),
        background: p.tile === 'ig' ? undefined : p.tile,
        // crne (TikTok, X) i bela (Google) pločica dobijaju tanak okvir, da se vide na svakoj podlozi
        boxShadow: p.ring || p.tile === '#FFFFFF' ? 'inset 0 0 0 1px rgb(128 128 128 / 0.35)' : undefined,
      }}
    >
      {p.icon ? <Fa icon={p.icon} style={{ fontSize: glyph }} /> : <GoogleG size={glyph + 1} />}
    </span>
  )
}

/** Znak i naziv u redu teksta (spiskovi, tabele, podnaslovi). */
export function NetworkName({
  platform,
  label,
  size = 14,
  className,
}: {
  platform: SocialPlatform | string
  label?: string
  size?: number
  className?: string
}) {
  if (!isSocial(platform)) return <span className={className}>{label ?? platform}</span>
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <NetworkIcon platform={platform} size={size} />
      <span className="truncate">{label ?? PLATFORMS[platform].label}</span>
    </span>
  )
}

/** Spisak mreža u redu: znak i naziv za svaku. */
export function NetworkNames({
  platforms,
  size,
  className,
}: {
  platforms: Array<SocialPlatform | string>
  size?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
      {platforms.map((p) => (
        <NetworkName key={p} platform={p} size={size} />
      ))}
    </span>
  )
}

/** Samo znaci (uske ćelije, npr. kalendar); naziv je u `title` i za čitač ekrana. */
export function NetworkIcons({
  platforms,
  size = 12,
  className,
}: {
  platforms: SocialPlatform[]
  size?: number
  className?: string
}) {
  const names = platforms.map((p) => PLATFORMS[p]?.label ?? p).join(', ')
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5', className)} title={names}>
      {platforms.map((p) => (
        <NetworkIcon key={p} platform={p} size={size} />
      ))}
      <span className="sr-only">{names}</span>
    </span>
  )
}

/** Čip sa okvirom u boji mreže (oznake uz objavu, nalozi). */
export function NetworkBadge({
  platform,
  label,
  className,
}: {
  platform: SocialPlatform | string
  label?: string
  className?: string
}) {
  if (!isSocial(platform))
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
          className,
        )}
      >
        {label ?? platform}
      </span>
    )
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2 pl-0.5 text-xs font-medium',
        className,
      )}
      style={{ borderColor: `color-mix(in oklab, ${byKey(platform).brand} 40%, var(--border))` }}
    >
      <NetworkIcon platform={platform} size={18} round />
      <span className="truncate">{label ?? PLATFORMS[platform].label}</span>
    </span>
  )
}
