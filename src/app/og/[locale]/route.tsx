import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

import { isAppLocale, type AppLocale } from '@/i18n/config'

/**
 * Slika za deljenje javnih strana na jeziku strane (D-095, D-130): tamna površina i plava kao na
 * landingu, Inter sa latinicom i ćirilicom iz `src/lib/visuals/fonts`. Strana je bira kroz
 * `openGraph.images` (`publicMetadata`), pa ista adresa sajta deljena na engleskom ima englesku sliku.
 */
const size = { width: 1200, height: 630 }
const fontDir = join(process.cwd(), 'src', 'lib', 'visuals', 'fonts')

const COPY: Record<AppLocale, { first: string; accent: string; rest: string; sub: string; font: number }> = {
  'sr-Latn': {
    first: 'Unesite sajt,',
    accent: 'Sova vodi',
    rest: 'vaše mreže.',
    sub: 'Strategija, objave, vizuali, zakazivanje i analitika za osam mreža.',
    font: 76,
  },
  en: {
    first: 'Enter your website,',
    accent: 'Sova runs',
    rest: 'your social media.',
    sub: 'Strategy, posts, visuals, scheduling and analytics for eight networks.',
    font: 64,
  },
  uk: {
    first: 'Вкажіть сайт,',
    accent: 'Sova веде',
    rest: 'ваші соцмережі.',
    sub: 'Стратегія, дописи, візуали, планування й аналітика для восьми мереж.',
    font: 68,
  },
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) return new Response('Not found', { status: 404 })
  const copy = COPY[locale]
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, 'Inter-400.woff')),
    readFile(join(fontDir, 'Inter-700.woff')),
  ])
  const line = { fontSize: copy.font, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: '#080d19',
        backgroundImage:
          'radial-gradient(circle at 85% 12%, rgba(25, 87, 210, 0.55), rgba(8, 13, 25, 0) 58%)',
        color: '#f3f5f8',
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundImage: 'linear-gradient(135deg, #3e8fff, #5dcdfa)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 18,
          }}
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 3px',
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#080d19' }} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700 }}>Sova</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={line}>{copy.first}</div>
        <div style={{ display: 'flex', ...line }}>
          <span style={{ color: '#5dcdfa', marginRight: 22 }}>{copy.accent}</span>
          <span>{copy.rest}</span>
        </div>
        <div style={{ fontSize: 32, color: '#99a6b8', lineHeight: 1.35, marginTop: 28 }}>{copy.sub}</div>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: '#99a6b8' }}>sovaai.rs</div>
    </div>,
    {
      ...size,
      headers: { 'cache-control': 'public, max-age=86400, immutable' },
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
