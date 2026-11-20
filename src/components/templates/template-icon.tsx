import {
  Award,
  BadgePercent,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  CircleHelp,
  Columns2,
  Gift,
  Handshake,
  Megaphone,
  MessagesSquare,
  PackagePlus,
  PartyPopper,
  Quote,
  ReceiptText,
  TrendingUp,
  UserRound,
  Vote,
  type LucideIcon,
} from 'lucide-react'

import type { TemplateId } from '@/lib/templates/catalog'
import { cn } from '@/lib/utils'

const ICONS: Record<TemplateId, LucideIcon> = {
  team: UserRound,
  testimonial: Quote,
  before_after: Columns2,
  case_study: TrendingUp,
  behind_scenes: Camera,
  quiz: CircleHelp,
  poll: Vote,
  faq: MessagesSquare,
  giveaway: Gift,
  offer: BadgePercent,
  launch: PackagePlus,
  price_list: ReceiptText,
  event: CalendarDays,
  milestone: PartyPopper,
  hiring: BriefcaseBusiness,
  announcement: Megaphone,
  award: Award,
  partnership: Handshake,
}

/** Ikonica šablona (D-175) u spisku i u zaglavlju forme. */
export function TemplateIcon({ id, className }: { id: TemplateId; className?: string }) {
  const Icon = ICONS[id]
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  )
}
