import type { MetadataRoute } from 'next'

/** Instalacija na telefon (D-118): Sova se otvara kao aplikacija, pravo na odobravanje nacrta. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Sova',
    short_name: 'Sova',
    description: 'Odobravajte nacrte i odgovarajte na poruke sa telefona.',
    start_url: '/app/approvals',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3DA9FC',
    lang: 'sr-Latn',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Odobravanje', url: '/app/approvals' },
      { name: 'Inbox', url: '/app/inbox' },
      { name: 'Studio', url: '/app/studio' },
    ],
  }
}
