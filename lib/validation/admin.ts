import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["all", "subscribed", "free", "blocked", "admins"]).default("all"),
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminTokensSchema = z.object({
  amount: z.coerce.number().int().refine((n) => n !== 0, "Iznos ne može biti 0.").refine((n) => Math.abs(n) <= 100000, "Najviše 100000 odjednom."),
  note: z.string().trim().min(3, "Napomena mora imati bar 3 znaka.").max(300),
});

export const adminUserPatchSchema = z
  .object({
    is_blocked: z.boolean().optional(),
    role: z.enum(["user", "admin"]).optional(),
  })
  .refine((v) => v.is_blocked !== undefined || v.role !== undefined, { message: "Nema šta da se promeni." });

export const adminAuditQuerySchema = z.object({
  admin: z.string().uuid().optional(),
  action: z
    .enum(["tokens_adjust", "impersonate_start", "impersonate_stop", "user_block", "user_unblock", "role_change", "user_delete", "generation_delete"])
    .optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
