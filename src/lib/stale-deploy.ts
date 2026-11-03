import { unstable_isUnrecognizedActionError } from 'next/navigation'

const KEY = 'sova:nova-verzija'

/**
 * Posle nove objave stara otvorena strana šalje serverske radnje koje novi server ne prepoznaje (Next:
 * „Failed to find Server Action”, D-141). Tada se strana sama osveži i učita novu verziju, najviše
 * jednom u minutu, da greška koja nije do verzije ne napravi petlju.
 */
export function reloadForNewVersion(error: unknown, now = Date.now()): boolean {
  if (!unstable_isUnrecognizedActionError(error)) return false
  try {
    if (now - Number(window.sessionStorage.getItem(KEY) ?? 0) < 60_000) return false
    window.sessionStorage.setItem(KEY, String(now))
  } catch {
    // bez sessionStorage-a (privatan prozor) strana se osveži; nova verzija tu grešku više ne pravi
  }
  window.location.reload()
  return true
}
