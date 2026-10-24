/**
 * Živi smoke test Gemini sloja sa ključem iz .env.local: tekst sa JSON šemom i embedding, a uz
 * `--image <putanja>` i jedna slika (troši par centi). Ključ se ne ispisuje.
 * Pokretanje: npx tsx --env-file=.env.local --conditions=react-server scripts/ai-smoke.ts
 */
import { writeFileSync } from 'node:fs'

import { embedTexts, generateImage, generateText } from '@/lib/ai/gemini'
import { env } from '@/lib/env'

async function main() {
  const text = await generateText({
    model: env.GEMINI_TEXT_MODEL,
    system: 'Pišeš kratke objave za društvene mreže na srpskom jeziku, latinicom.',
    prompt: 'Jedna rečenica za objavu servisa klima uređaja u Beogradu i dva haštaga.',
    jsonSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } },
      required: ['text', 'hashtags'],
    },
    maxOutputTokens: 600,
  })
  console.log(`tekst   ${text.model}, ${text.durationMs} ms, tokeni ${JSON.stringify(text.usage)}`)
  console.log(`        ${JSON.stringify(text.json)}`)

  const emb = await embedTexts({
    model: env.GEMINI_EMBEDDING_MODEL,
    texts: ['servis klima Beograd', 'čišćenje i dezinfekcija klime'],
  })
  console.log(`embed   ${emb.model}, ${emb.vectors.length} vektora × ${emb.vectors[0]?.length} dimenzija`)

  const i = process.argv.indexOf('--image')
  if (i > 0) {
    const out = process.argv[i + 1] ?? 'ai-smoke.png'
    const img = await generateImage({
      model: env.GEMINI_IMAGE_MODEL,
      prompt:
        'Fotografija: serviser u plavoj uniformi čisti filter zidne klime u svetlom stanu, prirodno svetlo, bez teksta.',
      aspectRatio: '4:5',
    })
    writeFileSync(out, Buffer.from(img.imageBase64, 'base64'))
    console.log(
      `slika   ${img.model}, ${img.durationMs} ms, ${img.mimeType}, tokeni ${JSON.stringify(img.usage)}`,
    )
    console.log(`        sačuvana u ${out}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
