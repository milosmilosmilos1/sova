import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

/**
 * Slika za deljenje javnih strana (D-095): tamna površina i plava kao na landingu, Inter sa srpskim
 * slovima iz `src/lib/visuals/fonts`. Pravi se pri build-u (bez podataka iz zahteva).
 */
export const alt = 'Sova: unesite sajt, Sova vodi vaše društvene mreže'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const fontDir = join(process.cwd(), 'src', 'lib', 'visuals', 'fonts')

export default async function Image() {
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, 'Inter-400.woff')),
    readFile(join(fontDir, 'Inter-700.woff')),
  ])
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
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
          Unesite sajt,
        </div>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
          <span style={{ color: '#5dcdfa', marginRight: 22 }}>Sova vodi</span>
          <span>vaše mreže.</span>
        </div>
        <div style={{ fontSize: 32, color: '#99a6b8', lineHeight: 1.35, marginTop: 28 }}>
          Strategija, objave, vizuali, zakazivanje i analitika za osam mreža.
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: '#99a6b8' }}>sovaai.rs</div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
