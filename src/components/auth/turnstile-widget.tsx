'use client'

import Script from 'next/script'
import { useEffect, useId, useRef } from 'react'

import { publicEnv } from '@/lib/env.public'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; theme?: string },
      ) => string
      remove: (id: string) => void
    }
  }
}

/** Cloudflare Turnstile; renderuje se samo kad je NEXT_PUBLIC_TURNSTILE_SITE_KEY podešen. */
export function TurnstileWidget({ name = 'turnstileToken' }: { name?: string }) {
  const siteKey = publicEnv.turnstileSiteKey
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const widgetId = useRef<string | null>(null)
  const id = useId()

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    const tryRender = () => {
      if (cancelled || widgetId.current || !containerRef.current || !window.turnstile) return
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          if (inputRef.current) inputRef.current.value = token
        },
      })
    }
    tryRender()
    const timer = setInterval(tryRender, 300)
    return () => {
      cancelled = true
      clearInterval(timer)
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey])

  if (!siteKey) return null
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div ref={containerRef} id={id} className="min-h-16" />
      <input ref={inputRef} type="hidden" name={name} />
    </>
  )
}
