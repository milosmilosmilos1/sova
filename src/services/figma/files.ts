import 'server-only'

import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { figmaBrand, frameNodes, type FigmaNode } from '@/lib/figma/brand'
import { parseFigmaLink } from '@/lib/figma/link'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import { safeFetch } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { googleFontExists } from '@/lib/visuals/fonts'
import { getFile, getImages, getNodes } from '@/integrations/figma/client'
import { getBrand } from '@/services/brands'
import { signedUrl } from '@/services/media'
import { storeLogoAsset } from '@/services/design/site-logos'
import { storeServerImage } from '@/services/visuals/store'
import { getFigmaAccessToken } from '@/services/figma/connection'

/**
 * Uvoz iz Figme (D-161): okviri fajla sa sličicama, uvoz izabranih okvira kao slika u biblioteku brenda
 * (redom kojim su izabrani, kao slajdovi karusela) i predlog boja, fontova i logoa iz okvira. Čitanje
 * fajla i izvoz slika su najstrože ograničeni Figma zahtevi, pa svaki korak troši jedan ili dva.
 */
export const FIGMA_FRAMES_MAX = 60
export const FIGMA_IMPORT_MAX = 20

export interface FigmaFrameView {
  id: string
  name: string
  page: string
  width: number
  height: number
  thumb: string | null
}

export interface FigmaFramesView {
  fileKey: string
  fileName: string
  frames: FigmaFrameView[]
  /** okvir iz linka (`node-id`), ako je u spisku */
  selected: string | null
}

export async function listFigmaFrames(
  viewer: Viewer,
  input: { workspaceId: string; url: string },
): Promise<FigmaFramesView> {
  await requireMembership(viewer, input.workspaceId)
  const link = parseFigmaLink(input.url)
  if (!link) throw new ApiError('VALIDATION', 'To nije link Figma fajla (figma.com/design/…).')
  const token = await getFigmaAccessToken(input.workspaceId, viewer.user.id)
  const file = await getFile(token, link.fileKey)
  const frames: Array<Omit<FigmaFrameView, 'thumb'>> = []
  for (const page of file.document.children ?? []) {
    for (const node of frameNodes(page)) {
      const box = node.absoluteBoundingBox
      if (!box || box.width < 50 || box.height < 50) continue
      frames.push({ id: node.id, name: node.name, page: page.name, width: box.width, height: box.height })
      if (frames.length >= FIGMA_FRAMES_MAX) break
    }
    if (frames.length >= FIGMA_FRAMES_MAX) break
  }
  // sličice u jednom pozivu, oko 240 px širine za najširi okvir
  const widest = Math.max(1, ...frames.map((f) => f.width))
  const thumbs = frames.length
    ? await getImages(
        token,
        link.fileKey,
        frames.map((f) => f.id),
        Math.min(1, Math.max(0.05, 240 / widest)),
      )
    : {}
  return {
    fileKey: link.fileKey,
    fileName: file.name,
    frames: frames.map((f) => ({ ...f, thumb: thumbs[f.id] ?? null })),
    selected: link.nodeId && frames.some((f) => f.id === link.nodeId) ? link.nodeId : null,
  }
}

/** Razmera izvoza: najčešća širina okvira postaje oko 1080 px (Instagram), najviše 4×. */
export function exportScale(widths: number[]): number {
  const sorted = [...widths].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1080
  return Math.min(4, Math.max(0.5, Math.round((1080 / median) * 4) / 4))
}

export interface FigmaImported {
  id: string
  nodeId: string
  name: string
  url: string
  width: number | null
  height: number | null
}

export async function importFigmaFrames(
  viewer: Viewer,
  input: { brandId: string; fileKey: string; frames: Array<{ id: string; name: string; width: number }> },
): Promise<{ assets: FigmaImported[]; failed: string[] }> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const token = await getFigmaAccessToken(brand.workspace_id, viewer.user.id)
  const ids = input.frames.map((f) => f.id)
  const urls = await getImages(token, input.fileKey, ids, exportScale(input.frames.map((f) => f.width)))
  const results = await mapLimit(input.frames, 4, async (frame) => {
    const url = urls[frame.id]
    if (!url) return null
    try {
      const res = await safeFetch(url, {
        timeoutMs: 30_000,
        maxBytes: 40 * 1024 * 1024,
        headers: { accept: 'image/*' },
      })
      if (!res.ok) return null
      // Instagram prima samo JPG; okvir je neprovidan, pa providni delovi idu na belo
      const bytes = await sharp(res.body).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer()
      const asset = await storeServerImage({
        workspaceId: brand.workspace_id,
        brandId: brand.id,
        bytes,
        mimeType: 'image/jpeg',
        source: 'upload',
        folder: 'figma',
        altText: frame.name.slice(0, 300),
        tags: ['figma'],
        attribution: { provider: 'figma', fileKey: input.fileKey, nodeId: frame.id },
        sourceData: { provider: 'figma', fileKey: input.fileKey, nodeId: frame.id, name: frame.name },
        uploadedBy: viewer.user.id,
      })
      return {
        id: asset.id,
        nodeId: frame.id,
        name: frame.name,
        url: await signedUrl(asset),
        width: asset.width,
        height: asset.height,
      }
    } catch (error) {
      logger.warn('figma_import_frame_failed', { fileKey: input.fileKey, nodeId: frame.id, error })
      return null
    }
  })
  const assets = results.filter((r): r is FigmaImported => Boolean(r))
  return {
    assets,
    failed: input.frames.filter((f) => !assets.some((a) => a.nodeId === f.id)).map((f) => f.name),
  }
}

export interface FigmaBrandProposal {
  primary: string | null
  secondary: string | null
  background: string
  fonts: { headings: string | null; body: string | null; headingsGoogle: boolean; bodyGoogle: boolean }
  logo: { assetId: string; url: string } | null
}

/** Boje, fontovi i logo iz izabranih okvira, kao predlog za sopstvenu temu brenda. */
export async function figmaBrandProposal(
  viewer: Viewer,
  input: { brandId: string; fileKey: string; nodeIds: string[] },
): Promise<FigmaBrandProposal> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const token = await getFigmaAccessToken(brand.workspace_id, viewer.user.id)
  const nodes = await getNodes(token, input.fileKey, input.nodeIds)
  const roots = Object.values(nodes).filter((n): n is FigmaNode => Boolean(n))
  if (!roots.length) throw new ApiError('NOT_FOUND', 'Figma nije vratila izabrane okvire.')
  const found = figmaBrand(roots)
  const [headingsGoogle, bodyGoogle] = await Promise.all([
    found.fonts.headings ? googleFontExists(found.fonts.headings) : false,
    found.fonts.body ? googleFontExists(found.fonts.body) : false,
  ])
  let logo: FigmaBrandProposal['logo'] = null
  if (found.logoNodeId) logo = await importLogo(token, brand, input.fileKey, found.logoNodeId)
  return {
    primary: found.primary,
    secondary: found.secondary,
    background: found.background,
    fonts: { ...found.fonts, headingsGoogle, bodyGoogle },
    logo,
  }
}

/** Sloj sa imenom „logo” kao PNG (providan) u biblioteci brenda; neuspeh ne obara predlog. */
async function importLogo(
  token: string,
  brand: { id: string; workspace_id: string },
  fileKey: string,
  nodeId: string,
): Promise<FigmaBrandProposal['logo']> {
  try {
    const url = (await getImages(token, fileKey, [nodeId], 2))[nodeId]
    if (!url) return null
    const res = await safeFetch(url, {
      timeoutMs: 20_000,
      maxBytes: 10 * 1024 * 1024,
      headers: { accept: 'image/*' },
    })
    if (!res.ok) return null
    const png = await sharp(res.body).png().toBuffer({ resolveWithObject: true })
    const stored = await storeLogoAsset({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      logo: {
        sourceUrl: `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(':', '-')}`,
        reason: 'figma',
        mimeType: 'image/png',
        bytes: png.data,
        png: png.data,
        width: png.info.width,
        height: png.info.height,
        isSvg: false,
      },
      log: { fileKey, nodeId },
    })
    if (!stored) return null
    const { data: asset } = await createSupabaseAdminClient()
      .from('media_assets')
      .select('*')
      .eq('id', stored.assetId)
      .single()
    return asset ? { assetId: stored.assetId, url: await signedUrl(asset) } : null
  } catch (error) {
    logger.warn('figma_logo_failed', { fileKey, nodeId, error })
    return null
  }
}
