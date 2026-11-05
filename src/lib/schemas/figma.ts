import { z } from 'zod'

/** Uvoz iz Figme (D-161). ID okvira u Figmi je „12:34” (u instanci komponente i „I12:34;5:6”). */
const nodeId = z.string().regex(/^I?\d+:\d+(;\d+:\d+)*$/)
const fileKey = z.string().regex(/^[A-Za-z0-9]{10,64}$/)

export const figmaConnectQuerySchema = z.object({
  workspaceId: z.uuid(),
  redirectTo: z.string().max(200).optional(),
})

export const figmaCallbackQuerySchema = z.object({
  state: z.string().max(200).optional(),
  code: z.string().max(2000).optional(),
  error: z.string().max(200).optional(),
})

export const figmaWorkspaceQuerySchema = z.object({ workspaceId: z.uuid() })

export const figmaFramesQuerySchema = z.object({
  workspaceId: z.uuid(),
  url: z.string().trim().min(10).max(2000),
})

export const figmaImportSchema = z.object({
  brandId: z.uuid(),
  fileKey,
  frames: z
    .array(z.object({ id: nodeId, name: z.string().max(300), width: z.number().positive().max(20_000) }))
    .min(1)
    .max(20),
})

export const figmaBrandSchema = z.object({
  brandId: z.uuid(),
  fileKey,
  nodeIds: z.array(nodeId).min(1).max(10),
})
