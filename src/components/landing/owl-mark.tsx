'use client'

import { useCallback } from 'react'

import { cn } from 'cn'

/**
 * Znak Sove na javnom sajtu (D-098): plavi kvadrat sa dva oka čije zenice prate kursor. Sve sove
 * na strani dele jedan slušalac pokreta miša, koji računa najviše jednom po frejmu; pomeraj je
 * ograničen na prostor oka i raste sa udaljenošću do 220 px. Uz smanjeno kretanje zenice miruju.
 */
const pupils = new Set<HTMLElement>()
let mouseX = 0
let mouseY = 0
let frame = 0

function update() {
  frame = 0
  for (const el of pupils) {
    const eye = el.parentElement?.getBoundingClientRect()
    if (!eye) continue
    const dx = mouseX - (eye.left + eye.width / 2)
    const dy = mouseY - (eye.top + eye.height / 2)
    const d = Math.hypot(dx, dy) || 1
    const k = Math.min(1, d / 220) * Math.max(0, (eye.width - el.offsetWidth) / 2 - 0.5)
    el.style.transform = `translate(${((dx / d) * k).toFixed(2)}px,${((dy / d) * k).toFixed(2)}px)`
  }
}

function onMove(e: MouseEvent) {
  mouseX = e.clientX
  mouseY = e.clientY
  if (!frame) frame = requestAnimationFrame(update)
}

const SIZES = {
  header: { box: 30, radius: 9, gap: 2, eye: 10, pupil: 4 },
  footer: { box: 24, radius: 7, gap: 2, eye: 8, pupil: 3.5 },
  cta: { box: 72, radius: 22, gap: 5, eye: 24, pupil: 10 },
} as const

export function OwlMark({ size, className }: { size: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size]
  const pupilRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!pupils.size) window.addEventListener('mousemove', onMove, { passive: true })
    pupils.add(el)
    return () => {
      pupils.delete(el)
      if (pupils.size) return
      window.removeEventListener('mousemove', onMove)
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }
  }, [])
  return (
    <span
      aria-hidden
      className={cn('flex flex-none items-center justify-center bg-l-accent', className)}
      style={{
        width: s.box,
        height: s.box,
        borderRadius: s.radius,
        gap: s.gap,
        boxShadow: size === 'cta' ? '0 20px 50px -14px rgba(61,169,252,0.55)' : undefined,
      }}
    >
      {[0, 1].map((i) => (
        <span
          key={i}
          className="flex items-center justify-center rounded-full bg-white"
          style={{ width: s.eye, height: s.eye }}
        >
          <span
            ref={pupilRef}
            className="rounded-full bg-l-on-accent"
            style={{ width: s.pupil, height: s.pupil }}
          />
        </span>
      ))}
    </span>
  )
}
