#!/usr/bin/env node
/**
 * Demo nalog za lokalni pregled aplikacije (samo lokalni Supabase).
 *
 * Pravi korisnika `demo@sova.local` (ili DEMO_EMAIL), radni prostor „Sova demo” sa brendom
 * „Klima servis (demo)”, dva lažna naloga mreža (asistirano objavljivanje, bez pravih tokena),
 * aktivnu strategiju sa stubovima i kampanjom, objavljene objave sa metrikama za poslednjih
 * ~8 nedelja, dnevne metrike naloga, nacrte Autopilota na odobrenju, AI uvide, predloge u
 * Inbox-u, prolaze Autopilota i obaveštenja. Ponovno pokretanje briše prethodni demo i pravi nov.
 *
 * Pokretanje:  npm run demo:seed
 * Lozinka:     DEMO_PASSWORD iz okruženja ili nasumična, ispisuje se samo u konzoli.
 *
 * Nikad ne pokretati nad produkcijom: skripta odbija URL koji nije localhost.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'

// --- okruženje ---------------------------------------------------------------
try {
  const file = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of file.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
} catch {
  // okruženje može doći i spolja
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
if (!URL_ || !ANON || !SERVICE) {
  console.error(
    'Nedostaju NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ili SUPABASE_SERVICE_ROLE_KEY u .env.local.',
  )
  process.exit(1)
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_)) {
  console.error(`Demo podaci se prave samo nad lokalnim Supabase-om (URL je ${URL_}).`)
  process.exit(1)
}

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@sova.local'
const PASSWORD = process.env.DEMO_PASSWORD ?? `Sova-${randomBytes(9).toString('base64url')}`
const TZ = 'Europe/Belgrade'
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

// --- pomoćne funkcije ----------------------------------------------------------
let seed = 20261024
function rand() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (a, b) => Math.round(a + rand() * (b - a))
const DAY = 86_400_000

function must(result, what) {
  if (result.error) {
    console.error(`${what}: ${result.error.message}`)
    process.exit(1)
  }
  return result.data
}

function localDate(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** lokalno vreme brenda → UTC ISO (isti postupak kao zonedToUtc u aplikaciji) */
function zonedToUtc(date, time) {
  const [h, m] = time.split(':').map(Number)
  const guess = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  )
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  )
  return new Date(guess.getTime() - (asIfUtc - guess.getTime())).toISOString()
}
const today = localDate(new Date())
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
const thisMonday = addDays(today, -((weekday + 6) % 7))
const nextMonday = addDays(thisMonday, 7)

// --- 1. korisnik ---------------------------------------------------------------
async function findUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

const existing = await findUser(EMAIL)
if (existing) {
  const { data: memberships } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', existing.id)
    .eq('role', 'owner')
  for (const m of memberships ?? []) {
    const del = await admin.from('workspaces').delete().eq('id', m.workspace_id)
    if (del.error)
      await admin.from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', m.workspace_id)
  }
  await admin.auth.admin.deleteUser(existing.id)
  console.log('Prethodni demo nalog je obrisan.')
}

const created = must(
  await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Korisnik' },
  }),
  'Korisnik',
)
const userId = created.user.id
const userClient = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
must(await userClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }), 'Prijava')

// --- 2. radni prostor, brend, tokeni --------------------------------------------
const ws = must(
  await userClient.rpc('create_workspace', {
    p_name: 'Sova demo',
    p_type: 'business',
    p_brand_name: 'Klima servis (demo)',
  }),
  'Radni prostor',
)
const wsId = ws.workspace_id
const brandId = ws.brand_id
must(
  await admin.rpc('grant_tokens', {
    p_workspace_id: wsId,
    p_source: 'admin',
    p_amount: 500,
    p_reference_type: 'demo',
    p_reference: `demo-${wsId}`,
    p_note: 'Demo tokeni za lokalni pregled',
  }),
  'Tokeni',
)
must(
  await admin
    .from('brands')
    .update({
      autopilot_level: 2,
      autopilot_token_budget: 300,
      autopilot_approval_deadline_hours: 24,
      autopilot_unapproved_action: 'skip',
      settings: {
        description: 'Servis, montaža i čišćenje klima uređaja u Beogradu.',
        tone: 'prijateljski, stručno, bez preterivanja',
        address: 'vi',
        emoji: true,
        facts: ['Dolazimo na adresu u Beogradu i okolini.', 'Servisiramo sve marke inverter klima.'],
        forbidden_words: ['najjeftiniji', 'garantovano najbolji'],
      },
    })
    .eq('id', brandId),
  'Brend',
)

// --- 3. nalozi mreža (lažni, asistirano objavljivanje) ---------------------------
const accounts = must(
  await admin
    .from('social_accounts')
    .insert([
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'facebook',
        external_id: `demo-page-${wsId.slice(0, 8)}`,
        name: 'Klima servis (demo)',
        account_type: 'facebook_page',
        status: 'active',
        capabilities: { publish: false, image: true, text: true, link: true },
        metadata: { demo: true },
        assisted_only: true,
        connected_by: userId,
      },
      {
        brand_id: brandId,
        workspace_id: wsId,
        platform: 'instagram',
        external_id: `demo-ig-${wsId.slice(0, 8)}`,
        external_parent_id: `demo-page-${wsId.slice(0, 8)}`,
        name: 'klimaservis.demo',
        username: 'klimaservis.demo',
        account_type: 'instagram_business',
        status: 'active',
        capabilities: { publish: false, image: true, carousel: true },
        metadata: { demo: true },
        assisted_only: true,
        connected_by: userId,
      },
    ])
    .select('id, platform'),
  'Nalozi',
)
const fb = accounts.find((a) => a.platform === 'facebook').id
const ig = accounts.find((a) => a.platform === 'instagram').id
const accountOf = { facebook: fb, instagram: ig }

// --- 4. strategija, stubovi, kampanja --------------------------------------------
const strategy = must(
  await admin
    .from('strategies')
    .insert({
      brand_id: brandId,
      period_start: thisMonday,
      period_end: addDays(thisMonday, 27),
      version: 1,
      status: 'active',
      summary:
        'Pred grejnu sezonu fokus je na servisu i čišćenju klima. Instagram gradi poverenje kroz savete i rad na terenu, Facebook donosi upite iz lokalne zajednice.',
      goals: [
        { goal: 'Više upita za zimski servis', kpi: 'upiti nedeljno', target: '8' },
        { goal: 'Veći doseg na Instagramu', kpi: 'doseg mesečno', target: '+20 %' },
        { goal: 'Više sačuvanih saveta', kpi: 'čuvanja po objavi', target: '15' },
      ],
      network_mix: {
        facebook: {
          per_week: 2,
          formats: ['objava sa fotografijom', 'kratki savet'],
          role: 'upiti i lokalna zajednica',
        },
        instagram: {
          per_week: 3,
          formats: ['karusel', 'reel', 'fotografija sa terena'],
          role: 'poverenje i saveti',
        },
      },
      best_times: {
        facebook: [
          { weekday: 2, hour: 12, minute: 0, source: 'data' },
          { weekday: 4, hour: 18, minute: 0, source: 'data' },
        ],
        instagram: [
          { weekday: 1, hour: 18, minute: 0, source: 'data' },
          { weekday: 3, hour: 19, minute: 0, source: 'assumption' },
          { weekday: 6, hour: 11, minute: 0, source: 'assumption' },
        ],
      },
      weekly_themes: [
        {
          week: 1,
          theme: 'Klima pred zimu',
          angle: 'šta proveriti pre grejne sezone',
          pillar: 'Edukacija',
          campaign: '',
        },
        {
          week: 2,
          theme: 'Zimski servis',
          angle: 'šta ulazi u servis i koliko traje',
          pillar: 'Ponuda',
          campaign: 'Zimski servis',
        },
        {
          week: 3,
          theme: 'Tim na terenu',
          angle: 'jedan dan sa serviserima',
          pillar: 'Iza kulisa',
          campaign: 'Zimski servis',
        },
        {
          week: 4,
          theme: 'Grejanje klimom',
          angle: 'kad se isplati i kako podesiti',
          pillar: 'Edukacija',
          campaign: '',
        },
      ],
      hashtag_strategy: {
        core: ['#klimaservis', '#klimauredjaji', '#beograd'],
        niche: ['#servisklime', '#ciscenjeklime', '#inverterklima', '#grejanjeklimom'],
        local: ['#beograd', '#novibeograd', '#zemun'],
        avoid: ['#follow4follow', '#like4like'],
      },
      uses_assumptions: true,
      assumptions: [
        'Vremena za Instagram sredom i subotom su pretpostavka dok ne bude više objava u tim terminima.',
      ],
      approved_by: userId,
      approved_at: new Date(Date.now() - 6 * DAY).toISOString(),
      created_by: userId,
    })
    .select('id')
    .single(),
  'Strategija',
)
const pillars = must(
  await admin
    .from('content_pillars')
    .insert([
      {
        brand_id: brandId,
        strategy_id: strategy.id,
        name: 'Edukacija',
        description: 'Saveti o održavanju i korišćenju klime',
        share_percent: 40,
        color: '#2563eb',
        sort_order: 0,
      },
      {
        brand_id: brandId,
        strategy_id: strategy.id,
        name: 'Ponuda',
        description: 'Servis, montaža i sezonske akcije',
        share_percent: 35,
        color: '#16a34a',
        sort_order: 1,
      },
      {
        brand_id: brandId,
        strategy_id: strategy.id,
        name: 'Iza kulisa',
        description: 'Tim, teren i stvarni radovi',
        share_percent: 25,
        color: '#f59e0b',
        sort_order: 2,
      },
    ])
    .select('id, name'),
  'Stubovi',
)
const pillarId = Object.fromEntries(pillars.map((p) => [p.name, p.id]))
const campaign = must(
  await admin
    .from('campaigns')
    .insert({
      brand_id: brandId,
      strategy_id: strategy.id,
      name: 'Zimski servis',
      goal: 'upiti za servis pre grejne sezone',
      starts_on: addDays(thisMonday, 7),
      ends_on: addDays(thisMonday, 20),
      key_message: 'Očistite klimu pre nego što počnete da grejete.',
      offer: 'Besplatna provera gasa uz servis',
      cta: 'Zakažite termin porukom',
      utm_campaign: 'zimski-servis',
    })
    .select('id')
    .single(),
  'Kampanja',
)

// --- 5. objavljene objave sa metrikama --------------------------------------------
const TEXTS = [
  [
    'Edukacija',
    'Pre grejne sezone očistite filtere klime. Prljav filter troši više struje i širi prašinu po stanu. Ako ne znate kako, pošaljite nam poruku i objasnićemo korak po korak.',
  ],
  [
    'Iza kulisa',
    'Danas smo na Banovom brdu montirali tri klime u jednom stanu. Uredno, bez nepotrebnog štemovanja, a cevi su sakrivene u lajsne.',
  ],
  [
    'Ponuda',
    'Servis klime radimo na adresi: čišćenje unutrašnje i spoljne jedinice, dezinfekcija i provera rada. Zakažite termin porukom.',
  ],
  [
    'Edukacija',
    'Može li klima da greje kad je napolju minus? Inverter klime rade i na niskim temperaturama, ali starije klime gube snagu. Pitajte nas za vaš model.',
  ],
  [
    'Edukacija',
    'Neprijatan miris iz klime najčešće znači da je isparivač prljav. Rešenje je dubinsko čišćenje, ne osveživač prostora.',
  ],
  [
    'Iza kulisa',
    'Upoznajte Nikolu. Kod nas radi šest godina i zna svaku marku klime po zvuku spoljne jedinice.',
  ],
  [
    'Ponuda',
    'Selite se? Demontiramo klimu, prenesemo je i montiramo u novom stanu, uz proveru gasa i dihtovanja.',
  ],
  [
    'Edukacija',
    'Koliko često servisirati klimu? Za stan je dovoljno jednom godišnje, a za lokal ili kancelariju dva puta godišnje.',
  ],
  [
    'Iza kulisa',
    'Pre i posle: ovako izgleda unutrašnja jedinica posle dve godine bez čišćenja, i ovako posle našeg servisa.',
  ],
  [
    'Edukacija',
    'Režim grejanja podesite na 21 do 22 stepena. Svaki stepen više znači primetno veći račun za struju.',
  ],
]

const published = []
for (let i = 0; i < 20; i++) {
  const ago = i < 14 ? 1 + i * 2 : 32 + (i - 14) * 4 // 14 u poslednjih 30 dana, 6 u prethodnom periodu
  const platform = i % 3 === 1 ? 'facebook' : 'instagram'
  const [pillar, text] = TEXTS[i % TEXTS.length]
  const date = addDays(today, -ago)
  const at = zonedToUtc(date, platform === 'instagram' ? '18:00' : '12:00')
  const post = must(
    await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        title: text.split('.')[0].slice(0, 80),
        master_text: text,
        status: 'published',
        source: i % 2 === 0 ? 'autopilot' : 'manual',
        pillar_id: pillarId[pillar],
        strategy_id: ago < 7 ? strategy.id : null,
        scheduled_for: at,
        approved_at: at,
        approved_by: userId,
        created_by: userId,
        // istorija izgleda kao prava: napravljeno dan ranije, poslednja izmena u trenutku objave
        created_at: new Date(new Date(at).getTime() - DAY).toISOString(),
        updated_at: at,
      })
      .select('id')
      .single(),
    'Objava',
  )
  const target = must(
    await admin
      .from('post_targets')
      .insert({
        post_id: post.id,
        brand_id: brandId,
        social_account_id: accountOf[platform],
        platform,
        status: i % 5 === 3 ? 'assisted_done' : 'published',
        scheduled_at: at,
        published_at: new Date(new Date(at).getTime() + between(4, 40) * 1000).toISOString(),
        external_post_id: `demo-${platform}-${i}`,
        publish_latency_ms: between(4000, 40000),
        attempt_count: 1,
        assisted: i % 5 === 3,
        assisted_done_at: i % 5 === 3 ? at : null,
      })
      .select('id')
      .single(),
    'Target',
  )
  const older = i >= 14
  const boost = i === 4 ? 3.2 : 1 // jedna objava sa izuzetnim angažovanjem
  const baseReach =
    (platform === 'instagram' ? between(420, 900) : between(250, 600)) * (older ? 0.7 : 1) * boost
  const horizons = ['1h', '24h', ...(ago >= 7 ? ['7d'] : []), ...(ago >= 30 ? ['30d'] : [])]
  const factor = { '1h': 0.25, '24h': 0.75, '7d': 0.95, '30d': 1 }
  for (const h of horizons) {
    const reach = Math.round(baseReach * factor[h])
    const reactions = Math.round(reach * (0.05 + rand() * 0.04))
    const comments = Math.round(reactions * (0.08 + rand() * 0.1))
    const shares = Math.round(reactions * (0.03 + rand() * 0.06))
    const saves = platform === 'instagram' ? Math.round(reactions * (0.15 + rand() * 0.2)) : null
    const engagement = reactions + comments + shares + (saves ?? 0)
    must(
      await admin.from('post_metrics_snapshots').insert({
        target_id: target.id,
        social_account_id: accountOf[platform],
        brand_id: brandId,
        horizon: h,
        captured_at: new Date(
          new Date(at).getTime() + { '1h': 3600e3, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }[h],
        ).toISOString(),
        impressions: Math.round(reach * 1.35),
        reach,
        reactions,
        comments,
        shares,
        saves,
        link_clicks: platform === 'facebook' ? Math.round(reach * 0.02) : null,
        engagement_rate: reach ? Math.round((engagement / reach) * 100000) / 100000 : null,
        raw: { demo: true, engagement },
      }),
      'Metrike',
    )
  }
  published.push({ targetId: target.id, postId: post.id, platform, ago, pillar })
}

// dnevne metrike naloga (pratioci rastu, doseg varira)
const daily = []
for (let d = 34; d >= 1; d--) {
  const date = addDays(today, -d)
  daily.push(
    {
      social_account_id: fb,
      brand_id: brandId,
      date,
      followers: 1180 + Math.round((34 - d) * 1.8),
      reach: between(180, 520),
      impressions: between(300, 900),
      profile_views: between(5, 30),
    },
    {
      social_account_id: ig,
      brand_id: brandId,
      date,
      followers: 820 + Math.round((34 - d) * 2.6),
      reach: between(260, 780),
      impressions: between(400, 1300),
      profile_views: between(12, 60),
    },
  )
}
must(await admin.from('account_metrics_daily').insert(daily), 'Metrike naloga')

// --- 6. nacrti Autopilota za narednu nedelju ---------------------------------------
const passedQa = {
  passed: true,
  similarity: 0.08,
  checks: [
    { name: 'empty', ok: true, message: 'Tekst postoji.' },
    { name: 'length', ok: true, message: 'Dužina u granicama mreže.' },
    { name: 'forbidden', ok: true, message: 'Bez zabranjenih reči.' },
    { name: 'script', ok: true, message: 'Pismo odgovara brendu.' },
    { name: 'similarity', ok: true, message: 'Najveća sličnost sa ranijim objavama 8 %.' },
    { name: 'facts', ok: true, message: 'Brojke potiču iz profila ili nema brojki.' },
    { name: 'media', ok: true, message: 'Vizual je u redu.' },
  ],
}
const upcoming = [
  {
    day: 0,
    time: '18:00',
    platform: 'instagram',
    status: 'in_review',
    pillar: 'Ponuda',
    campaign: true,
    text: 'Zimski servis je počeo. Dolazimo na adresu, čistimo obe jedinice i proveravamo gas. Zakažite termin porukom dok ima slobodnih dana.\n\n#klimaservis #servisklime #beograd',
  },
  {
    day: 1,
    time: '12:00',
    platform: 'facebook',
    status: 'in_review',
    pillar: 'Edukacija',
    campaign: true,
    text: 'Šta ulazi u servis klime? Čišćenje filtera i isparivača, pranje spoljne jedinice, dezinfekcija i provera pritiska gasa. Traje oko sat vremena po klimi.',
  },
  {
    day: 2,
    time: '19:00',
    platform: 'instagram',
    status: 'in_review',
    pillar: 'Iza kulisa',
    campaign: true,
    text: 'Jedan dan sa našim serviserima: tri adrese, dve montaže i jedna klima koja nije čišćena pet godina. Pogledajte karusel do kraja.\n\n#klimaservis #ciscenjeklime',
  },
  {
    day: 3,
    time: '18:00',
    platform: 'facebook',
    status: 'draft',
    pillar: 'Ponuda',
    campaign: true,
    returned: true,
    text: 'Najjeftiniji servis klime u gradu! Zovite odmah, popust važi samo ovog vikenda.',
  },
  {
    day: 5,
    time: '11:00',
    platform: 'instagram',
    status: 'approved',
    pillar: 'Edukacija',
    campaign: false,
    text: 'Tri znaka da klimi treba servis: slabije hladi ili greje, čuje se novi zvuk i oseća se miris pri uključivanju.\n\n#klimauredjaji #savet',
  },
]
for (const u of upcoming) {
  const at = zonedToUtc(addDays(nextMonday, u.day), u.time)
  const post = must(
    await admin
      .from('posts')
      .insert({
        brand_id: brandId,
        workspace_id: wsId,
        title: u.text.split(/[.!?]/)[0].slice(0, 80),
        master_text: u.text,
        status: u.status,
        source: 'autopilot',
        pillar_id: pillarId[u.pillar],
        campaign_id: u.campaign ? campaign.id : null,
        strategy_id: strategy.id,
        scheduled_for: at,
        submitted_at: u.status === 'in_review' ? new Date().toISOString() : null,
        approved_at: u.status === 'approved' ? new Date().toISOString() : null,
        approved_by: u.status === 'approved' ? userId : null,
        qa_report: u.returned
          ? {
              passed: false,
              similarity: 0.12,
              checks: passedQa.checks.map((c) =>
                c.name === 'forbidden'
                  ? { name: 'forbidden', ok: false, message: 'Zabranjene reči: najjeftiniji.' }
                  : c,
              ),
            }
          : passedQa,
      })
      .select('id')
      .single(),
    'Nacrt',
  )
  must(
    await admin.from('post_targets').insert({
      post_id: post.id,
      brand_id: brandId,
      social_account_id: accountOf[u.platform],
      platform: u.platform,
      status: 'pending',
    }),
    'Target nacrta',
  )
  if (u.status === 'in_review') {
    must(
      await admin.from('approvals').insert({
        post_id: post.id,
        brand_id: brandId,
        workspace_id: wsId,
        step: 1,
        requested_by: null,
        post_version: 1,
      }),
      'Odobrenje',
    )
  }
}

// --- 7. AI uvidi, predlozi, prolazi, obaveštenja -------------------------------------
const recent = published.filter((p) => p.ago < 30)
const ig4 = published[4]
must(
  await admin.from('insights').insert({
    brand_id: brandId,
    period_start: addDays(today, -7),
    period_end: today,
    items: [
      {
        claim: 'Objava o neprijatnom mirisu iz klime ima više od tri puta veći doseg od proseka.',
        recommendation:
          'Napravite karusel „Pet znakova da je klimi potrebno čišćenje” i objavite ga u ponedeljak u 18 h.',
        evidenceTargetIds: [ig4.targetId],
        confidence: 0.8,
        suggestionKind: 'repeat_format',
        suggestionTitle: 'Ponovite format saveta sa problemom i rešenjem',
        suggestionBody: '',
      },
      {
        claim: 'Instagram objave u 18 h imaju u proseku 35 % više angažovanja od Facebook objava u podne.',
        recommendation:
          'Zadržite Instagram kao glavni kanal za savete, a Facebook koristite za ponudu i upite.',
        evidenceTargetIds: recent.slice(0, 3).map((p) => p.targetId),
        confidence: 0.6,
        suggestionKind: '',
        suggestionTitle: '',
        suggestionBody: '',
      },
      {
        claim: 'Objave iz stuba „Iza kulisa” imaju najviše komentara po objavi.',
        recommendation: 'Dodajte jednu objavu sa terena nedeljno, sa imenom servisera i lokacijom.',
        evidenceTargetIds: published
          .filter((p) => p.pillar === 'Iza kulisa' && p.ago < 30)
          .map((p) => p.targetId),
        confidence: 0.55,
        suggestionKind: '',
        suggestionTitle: '',
        suggestionBody: '',
      },
    ],
  }),
  'Uvidi',
)
const in14 = new Date(Date.now() + 14 * DAY).toISOString()
must(
  await admin.from('suggestions').insert([
    {
      brand_id: brandId,
      source: 'insight',
      kind: 'repeat_format',
      title: 'Ponovite format saveta sa problemom i rešenjem',
      body: 'Objava o mirisu iz klime imala je tri puta veći doseg od proseka. Napravite karusel sa pet znakova da je klimi potrebno čišćenje.',
      payload: { claim: 'Savet sa problemom i rešenjem radi najbolje.' },
      evidence: { targetIds: [ig4.targetId] },
      score: 80,
      expires_at: in14,
      status: 'new',
    },
    {
      brand_id: brandId,
      source: 'blog',
      kind: 'new_blog_post',
      title: 'Nov tekst na blogu: Kako da klima greje, a da račun ne skoči',
      body: 'Napravite objavu za mreže iz novog teksta sa sajta.',
      payload: {
        url: 'https://example.com/blog/grejanje-klimom',
        title: 'Kako da klima greje, a da račun ne skoči',
      },
      evidence: { source: 'rss' },
      score: 70,
      expires_at: in14,
      status: 'new',
    },
    {
      brand_id: brandId,
      source: 'holiday',
      kind: 'post_idea',
      title: 'Black Friday (27.11.)',
      body: 'Pripremite objavu za Black Friday: ponudu za servis ili montažu, ili poruku da u tom periodu radite po zakazivanju.',
      payload: { date: '2026-11-27', name: 'Black Friday', kind: 'commercial' },
      score: 55,
      expires_at: in14,
      status: 'new',
    },
    {
      brand_id: brandId,
      source: 'analytics',
      kind: 'repeat_format',
      title: 'Ponovite format: Instagram objava sa 120 interakcija',
      body: 'Objava „Pre i posle” ima više od dvostrukog proseka interakcija. Napravite sličnu sa drugom klimom.',
      payload: { text: TEXTS[8][1] },
      evidence: { targetIds: [published[8].targetId] },
      score: 75,
      expires_at: in14,
      status: 'dismissed',
      decided_by: userId,
      decided_at: new Date(Date.now() - 2 * DAY).toISOString(),
    },
  ]),
  'Predlozi',
)
must(
  await admin.from('autopilot_runs').insert([
    {
      brand_id: brandId,
      workspace_id: wsId,
      kind: 'weekly',
      period_start: thisMonday,
      level: 2,
      status: 'succeeded',
      summary: {
        planned: 5,
        submitted: 4,
        scheduled: 0,
        returned: 1,
        budgetStopped: false,
        errors: 0,
        tokens: 14,
      },
      tokens_used: 14,
      created_at: zonedToUtc(addDays(thisMonday, -7), '06:05'),
      finished_at: zonedToUtc(addDays(thisMonday, -7), '06:09'),
    },
    {
      brand_id: brandId,
      workspace_id: wsId,
      kind: 'weekly',
      period_start: nextMonday,
      level: 2,
      status: 'succeeded',
      summary: {
        planned: 5,
        submitted: 3,
        scheduled: 0,
        returned: 1,
        budgetStopped: false,
        errors: 0,
        tokens: 14,
      },
      tokens_used: 14,
      created_at: zonedToUtc(thisMonday, '06:04'),
      finished_at: zonedToUtc(thisMonday, '06:08'),
    },
  ]),
  'Prolazi Autopilota',
)
// generacije Autopilota iz kojih se računa mesečna potrošnja budžeta: po prolazu 5 tekstova
// i 2 vizuala za Instagram, svaki po 2 tokena (14 + 14 = 28, isto kao u tabeli prolaza)
const gens = []
for (let i = 0; i < 14; i++) {
  gens.push({
    workspace_id: wsId,
    brand_id: brandId,
    user_id: null,
    type: i % 7 >= 5 ? 'visual_template' : 'text',
    status: 'succeeded',
    model: i % 7 >= 5 ? null : 'gemini-3.8-flash',
    input: { autopilot: true, demo: true },
    tokens_charged: 2,
    created_at: new Date(Date.now() - (i < 7 ? 5 : 1) * DAY).toISOString(),
    finished_at: new Date(Date.now() - (i < 7 ? 5 : 1) * DAY + 60_000).toISOString(),
  })
}
must(await admin.from('ai_generations').insert(gens), 'Generacije')

const note = (type, title, body, link, data = {}) => ({
  user_id: userId,
  workspace_id: wsId,
  brand_id: brandId,
  type,
  title,
  body,
  data: { ...data, link },
})
must(
  await admin
    .from('notifications')
    .insert([
      note(
        'autopilot_weekly_report',
        'Autopilot: nedeljni izveštaj za Klima servis (demo)',
        `Prošle nedelje: 4 objave, doseg 2.480, angažovanje 312. Za nedelju od ${nextMonday}: 5 nacrta, 3 čeka odobrenje, 1 vraćeno na doradu.`,
        '/app/posts?status=in_review',
      ),
      note(
        'autopilot_returned',
        'Autopilot je vratio objavu na doradu',
        'Najjeftiniji servis klime u gradu: Zabranjene reči: najjeftiniji.',
        '/app/posts',
      ),
      note(
        'insights_ready',
        'Novi uvidi za Klima servis (demo)',
        'Objava o neprijatnom mirisu iz klime ima više od tri puta veći doseg od proseka.',
        '/app/analytics',
      ),
      note('post_published', 'Objava je objavljena', 'klimaservis.demo (instagram)', '/app/analytics'),
    ]),
  'Obaveštenja',
)

console.log('')
console.log('Demo nalog je spreman (lokalno).')
console.log(`  Adresa:  ${APP}/login`)
console.log(`  Email:   ${EMAIL}`)
console.log(`  Lozinka: ${PASSWORD}`)
console.log('')
console.log(
  `  Objavljeno: ${published.length} objava sa metrikama, ${upcoming.length} nacrta Autopilota za nedelju od ${nextMonday}.`,
)
console.log(
  '  Nalozi mreža su lažni i označeni kao asistirano objavljivanje: ništa ne odlazi na prave mreže.',
)
